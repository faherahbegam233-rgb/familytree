/* Wires the "Suggest an edit" / "Upload photo" / "+ Suggest a new person"
   controls to real Supabase writes, plus the admin-only direct photo
   replace. Loaded after tree.script.js. Expects window.__supabase (a
   Supabase browser client using the public anon key) to already exist —
   see components/SupabaseBridge.tsx. */
(function () {
  "use strict";

  var FAMILY_LABEL = { abubakar: "Abu Bakar", kuddus: "Kuddus", maricar: "Maricar" };
  var STATUS_OPTIONS = [
    ["unknown", "Not sure"],
    ["living", "Living"],
    ["deceased", "Deceased"],
  ];

  function familyPeople(famKey) {
    var data = window.__TREE_DATA__ || {};
    return { abubakar: data.A, kuddus: data.K, maricar: data.M }[famKey] || {};
  }

  function personName(pid, famKey) {
    var map = familyPeople(famKey);
    return (map[pid] && map[pid].name) || pid;
  }

  function personOptionsHTML(famKey, excludePid) {
    var map = familyPeople(famKey);
    var ids = Object.keys(map).sort(function (a, b) {
      return map[a].name.localeCompare(map[b].name);
    });
    return ids
      .filter(function (id) {
        return id !== excludePid;
      })
      .map(function (id) {
        return '<option value="' + id + '">' + map[id].name + " (Gen " + map[id].gen + ")</option>";
      })
      .join("");
  }

  function statusOptionsHTML(selected) {
    return STATUS_OPTIONS.map(function (o) {
      return '<option value="' + o[0] + '"' + (o[0] === selected ? " selected" : "") + ">" + o[1] + "</option>";
    }).join("");
  }

  function toast(msg) {
    var t = document.getElementById("toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("show");
    setTimeout(function () {
      t.classList.remove("show");
    }, 3200);
  }

  function notify(kind, famKey, personNameStr, submittedName, submittedNote) {
    fetch("/api/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: kind,
        familyLabel: FAMILY_LABEL[famKey] || "",
        personName: personNameStr || "",
        submittedName: submittedName || "",
        submittedNote: submittedNote || "",
      }),
    }).catch(function () {
      /* best-effort — the suggestion itself already saved */
    });
  }

  function field(label, inputHTML) {
    return (
      '<label style="display:block;font-size:12px;color:var(--muted);margin-bottom:4px;margin-top:10px;">' +
      label +
      "</label>" +
      inputHTML
    );
  }
  var TXT = 'style="width:100%;" class="search-input"';

  function overlayHTML(title, fieldsHTML) {
    return (
      '<div class="dtl-name" style="margin-bottom:6px;">' + title + "</div>" +
      '<form id="quickForm">' +
      fieldsHTML +
      '<div class="dtl-actions" style="margin-top:16px;">' +
      '<button type="submit" class="btn primary">Send to Faherah</button>' +
      '<button type="button" class="btn" id="quickFormCancel">Cancel</button>' +
      "</div></form>"
    );
  }

  function showOverlay(html) {
    var content = document.getElementById("modalContent");
    content.innerHTML = html;
    var cancel = document.getElementById("quickFormCancel");
    if (cancel)
      cancel.addEventListener("click", function () {
        document.getElementById("scrim").classList.remove("open");
      });
    document.getElementById("scrim").classList.add("open");
  }

  function val(id) {
    var el = document.getElementById(id);
    return el ? el.value.trim() : "";
  }

  /* ---------------- Suggest an edit to an existing person ---------------- */
  window.__openSuggestEdit = function (pid, famKey) {
    var per = familyPeople(famKey)[pid] || {};
    showOverlay(
      overlayHTML(
        "Suggest an edit &mdash; " + per.name,
        field('Name', '<input type="text" id="sName" ' + TXT + ' value="' + (per.name || "") + '"/>') +
          field(
            "Date of birth",
            '<input type="text" id="sDob" ' + TXT + ' value="' + (per.dob || "") + '" placeholder="e.g. 12 March 1958, or ‘circa 1930s’"/>'
          ) +
          field('Status', '<select id="sStatus" ' + TXT + ">" + statusOptionsHTML(per.status || "unknown") + "</select>") +
          field("What they do / did", '<input type="text" id="sOccupation" ' + TXT + ' value="' + (per.occupation || "") + '"/>') +
          field(
            "Traits / interesting facts",
            '<textarea id="sTraits" ' + TXT + ' style="width:100%;min-height:80px;font-family:inherit;">' +
              (per.traits || "") +
              "</textarea>"
          ) +
          field("Your name (optional)", '<input type="text" id="sName2" ' + TXT + ' placeholder="e.g. Fazil"/>') +
          field(
            "Anything else Faherah should know? (optional)",
            '<input type="text" id="sNote" ' + TXT + '/>'
          )
      )
    );
    document.getElementById("quickForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var proposed = {
        name: val("sName") || per.name,
        dob: val("sDob"),
        status: val("sStatus"),
        occupation: val("sOccupation"),
        traits: val("sTraits"),
      };
      var submittedName = val("sName2");
      var submittedNote = val("sNote");
      window.__supabase
        .from("suggestions")
        .insert({
          family: famKey,
          kind: "edit_person",
          target_person_id: pid,
          payload: { person_name: per.name, proposed: proposed },
          submitted_name: submittedName || null,
          submitted_note: submittedNote || null,
        })
        .then(function (res) {
          if (res.error) {
            toast("Couldn't send that — please try again in a moment.");
            return;
          }
          notify("edit_person", famKey, per.name, submittedName, submittedNote);
          toast("Thanks! Sent to Faherah for review.");
          document.getElementById("scrim").classList.remove("open");
        });
    });
  };

  /* ---------------- Upload a photo (goes to the review queue) ---------------- */
  window.__openUploadPhoto = function (pid, famKey) {
    var name = personName(pid, famKey);
    showOverlay(
      overlayHTML(
        "Upload a photo &mdash; " + name,
        field("Your name (optional)", '<input type="text" id="pName" ' + TXT + ' placeholder="e.g. Fazil"/>') +
          field("Photo", '<input type="file" id="pFile" accept="image/*" required/>') +
          field("Note (optional)", '<input type="text" id="pNote" ' + TXT + ' placeholder="e.g. Taken at the 2019 wedding"/>')
      )
    );
    document.getElementById("quickForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var fileInput = document.getElementById("pFile");
      var file = fileInput.files && fileInput.files[0];
      if (!file) return;
      var submittedName = val("pName");
      var note = val("pNote");
      var submitBtn = e.target.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      submitBtn.textContent = "Uploading…";

      var ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
      var path = "pending/" + pid + "-" + Date.now() + "." + ext;

      window.__supabase.storage
        .from("photos")
        .upload(path, file)
        .then(function (uploadRes) {
          if (uploadRes.error) throw uploadRes.error;
          return window.__supabase.from("suggestions").insert({
            family: famKey,
            kind: "upload_photo",
            target_person_id: pid,
            payload: { person_name: name, storage_path: path },
            submitted_name: submittedName || null,
            submitted_note: note || null,
          });
        })
        .then(function (res) {
          if (res && res.error) throw res.error;
          notify("upload_photo", famKey, name, submittedName, note);
          toast("Thanks! Sent to Faherah for review.");
          document.getElementById("scrim").classList.remove("open");
        })
        .catch(function () {
          toast("Couldn't upload that photo — please try again.");
          submitBtn.disabled = false;
          submitBtn.textContent = "Send to Faherah";
        });
    });
  };

  /* ---------------- Admin: replace a photo immediately, no review queue ---------------- */
  window.__openAdminPhoto = function (pid, famKey) {
    var name = personName(pid, famKey);
    showOverlay(
      '<div class="dtl-name" style="margin-bottom:6px;">Replace photo &mdash; ' + name + "</div>" +
        '<form id="quickForm">' +
        field("Photo", '<input type="file" id="aFile" accept="image/*" required/>') +
        '<div class="dtl-actions" style="margin-top:16px;">' +
        '<button type="submit" class="btn primary">Save now</button>' +
        '<button type="button" class="btn" id="quickFormCancel">Cancel</button>' +
        "</div></form>"
    );
    document.getElementById("quickFormCancel").addEventListener("click", function () {
      document.getElementById("scrim").classList.remove("open");
    });
    document.getElementById("quickForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var fileInput = document.getElementById("aFile");
      var file = fileInput.files && fileInput.files[0];
      if (!file) return;
      var submitBtn = e.target.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      submitBtn.textContent = "Saving…";
      var fd = new FormData();
      fd.append("pid", pid);
      fd.append("file", file);
      fetch("/api/admin/photo", { method: "POST", body: fd })
        .then(function (r) {
          return r.json();
        })
        .then(function (res) {
          if (res.error) throw new Error(res.error);
          window.__setPhoto(pid, res.photoUrl);
          toast("Photo updated.");
          if (window.__openDetail) window.__openDetail(pid, famKey);
          else document.getElementById("scrim").classList.remove("open");
        })
        .catch(function () {
          toast("Couldn't save that photo — please try again.");
          submitBtn.disabled = false;
          submitBtn.textContent = "Save now";
        });
    });
  };

  /* ---------------- Suggest a brand-new person ---------------- */
  function newPersonFieldsHTML() {
    return (
      field("Name", '<input type="text" id="npName" ' + TXT + " required/>") +
      field(
        "Gender",
        '<select id="npGender" ' +
          TXT +
          ' required><option value="">Choose…</option><option value="f">Female</option><option value="m">Male</option><option value="u">Not sure</option></select>'
      ) +
      field("Date of birth (optional)", '<input type="text" id="npDob" ' + TXT + ' placeholder="e.g. 1990, or ‘circa 1930s’"/>') +
      field("Status", '<select id="npStatus" ' + TXT + ">" + statusOptionsHTML("unknown") + "</select>") +
      field("What they do / did (optional)", '<input type="text" id="npOccupation" ' + TXT + '/>') +
      field("Traits / interesting facts (optional)", '<textarea id="npTraits" ' + TXT + ' style="width:100%;min-height:60px;font-family:inherit;"></textarea>')
    );
  }
  function readNewPersonFields() {
    return {
      name: val("npName"),
      gender: val("npGender"),
      dob: val("npDob"),
      status: val("npStatus"),
      occupation: val("npOccupation"),
      traits: val("npTraits"),
    };
  }

  function openAddChildForm(famKey) {
    showOverlay(
      overlayHTML(
        "Suggest a new person &mdash; child of an existing couple",
        field(
          "Parent",
          '<select id="acParent1" ' + TXT + ' required><option value="">Choose…</option>' + personOptionsHTML(famKey) + "</select>"
        ) +
          field(
            "Second parent (if known)",
            '<select id="acParent2" ' + TXT + '><option value="">Not sure / not listed</option>' + personOptionsHTML(famKey) + "</select>"
          ) +
          newPersonFieldsHTML() +
          field("Your name (optional)", '<input type="text" id="acName2" ' + TXT + '/>') +
          field("Anything else Faherah should know? (optional)", '<input type="text" id="acNote" ' + TXT + '/>')
      )
    );
    document.getElementById("quickForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var parent1 = val("acParent1");
      if (!parent1) return;
      var parent2 = val("acParent2") || null;
      var newPerson = readNewPersonFields();
      if (!newPerson.name || !newPerson.gender) return;
      var submittedName = val("acName2");
      var submittedNote = val("acNote");
      window.__supabase
        .from("suggestions")
        .insert({
          family: famKey,
          kind: "add_child",
          payload: { parent1_id: parent1, parent2_id: parent2, new_person: newPerson },
          submitted_name: submittedName || null,
          submitted_note: submittedNote || null,
        })
        .then(function (res) {
          if (res.error) {
            toast("Couldn't send that — please try again in a moment.");
            return;
          }
          notify("add_child", famKey, newPerson.name, submittedName, submittedNote);
          toast("Thanks! Sent to Faherah for review.");
          document.getElementById("scrim").classList.remove("open");
        });
    });
  }

  function openAddPartnerForm(famKey) {
    showOverlay(
      overlayHTML(
        "Suggest a new person &mdash; partner of someone already on the tree",
        field(
          "Existing person",
          '<select id="apExisting" ' + TXT + ' required><option value="">Choose…</option>' + personOptionsHTML(famKey) + "</select>"
        ) +
          newPersonFieldsHTML() +
          field("Your name (optional)", '<input type="text" id="apName2" ' + TXT + '/>') +
          field("Anything else Faherah should know? (optional)", '<input type="text" id="apNote" ' + TXT + '/>')
      )
    );
    document.getElementById("quickForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var existing = val("apExisting");
      if (!existing) return;
      var newPerson = readNewPersonFields();
      if (!newPerson.name || !newPerson.gender) return;
      var submittedName = val("apName2");
      var submittedNote = val("apNote");
      window.__supabase
        .from("suggestions")
        .insert({
          family: famKey,
          kind: "add_partner",
          payload: { existing_person_id: existing, new_person: newPerson },
          submitted_name: submittedName || null,
          submitted_note: submittedNote || null,
        })
        .then(function (res) {
          if (res.error) {
            toast("Couldn't send that — please try again in a moment.");
            return;
          }
          notify("add_partner", famKey, newPerson.name, submittedName, submittedNote);
          toast("Thanks! Sent to Faherah for review.");
          document.getElementById("scrim").classList.remove("open");
        });
    });
  }

  function openAddPersonChoice(famKey) {
    document.getElementById("modalContent").innerHTML =
      '<div class="dtl-name" style="margin-bottom:10px;">Suggest a new person</div>' +
      '<p style="font-size:13.5px;color:var(--muted);margin-bottom:14px;">How are they related to someone already on the ' +
      (FAMILY_LABEL[famKey] || famKey) +
      " tree?</p>" +
      '<div class="dtl-actions">' +
      '<button class="btn primary" id="addChildChoice">They\'re someone\'s child</button>' +
      '<button class="btn" id="addPartnerChoice">They\'re someone\'s partner</button>' +
      "</div>";
    document.getElementById("addChildChoice").addEventListener("click", function () {
      openAddChildForm(famKey);
    });
    document.getElementById("addPartnerChoice").addEventListener("click", function () {
      openAddPartnerForm(famKey);
    });
    document.getElementById("scrim").classList.add("open");
  }

  var addPersonBtn = document.getElementById("addPersonBtn");
  if (addPersonBtn) {
    addPersonBtn.addEventListener("click", function () {
      var famKey = window.__activeFamily;
      if (!famKey) {
        toast("Open a family tab first.");
        return;
      }
      openAddPersonChoice(famKey);
    });
  }
})();
