/* Wires the "Suggest an edit" / "Upload photo" buttons in the person modal to
   real Supabase writes. Loaded after tree.script.js. Expects window.__supabase
   (a Supabase browser client using the public anon key) to already exist —
   see components/SupabaseBridge.tsx. */
(function () {
  "use strict";

  function familyLabel(famKey) {
    return { abubakar: "Abu Bakar", kuddus: "Kuddus", maricar: "Maricar" }[famKey] || famKey;
  }

  function personName(pid, famKey) {
    var data = window.__TREE_DATA__ || {};
    var map = { abubakar: data.A, kuddus: data.K, maricar: data.M }[famKey] || {};
    return (map[pid] && map[pid].name) || pid;
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

  function overlayFormHTML(title, fieldsHTML) {
    return (
      '<div class="dtl-name" style="margin-bottom:10px;">' + title + "</div>" +
      '<form id="quickForm">' +
      fieldsHTML +
      '<div class="dtl-actions" style="margin-top:14px;">' +
      '<button type="submit" class="btn primary">Send to Faherah</button>' +
      '<button type="button" class="btn" id="quickFormCancel">Cancel</button>' +
      "</div></form>"
    );
  }

  function showOverlay(html) {
    var content = document.getElementById("modalContent");
    content.dataset.prevHtml = content.innerHTML;
    content.innerHTML = html;
    var cancel = document.getElementById("quickFormCancel");
    if (cancel)
      cancel.addEventListener("click", function () {
        content.innerHTML = content.dataset.prevHtml || "";
      });
  }

  window.__openSuggestEdit = function (pid, famKey) {
    var name = personName(pid, famKey);
    showOverlay(
      overlayFormHTML(
        "Suggest an edit &mdash; " + name,
        '<label style="display:block;font-size:12px;color:var(--muted);margin-bottom:4px;">Your name (optional)</label>' +
          '<input type="text" id="sName" class="search-input" style="width:100%;margin-bottom:10px;" placeholder="e.g. Fazil"/>' +
          '<label style="display:block;font-size:12px;color:var(--muted);margin-bottom:4px;">What should change?</label>' +
          '<textarea id="sNote" class="search-input" style="width:100%;min-height:90px;font-family:inherit;" placeholder="e.g. Her name is spelled ' +
          '‘Nasreen’ not ‘Nasrin’, and she was born in Karikal not Neravy." required></textarea>'
      )
    );
    document.getElementById("quickForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var note = document.getElementById("sNote").value.trim();
      var submittedName = document.getElementById("sName").value.trim();
      if (!note) return;
      window.__supabase
        .from("suggestions")
        .insert({
          family: famKey,
          kind: "edit_person",
          target_person_id: pid,
          payload: { person_name: name },
          submitted_name: submittedName || null,
          submitted_note: note,
        })
        .then(function (res) {
          if (res.error) {
            toast("Couldn't send that — please try again in a moment.");
            return;
          }
          toast("Thanks! Sent to Faherah for review.");
          document.getElementById("scrim").classList.remove("open");
        });
    });
  };

  window.__openUploadPhoto = function (pid, famKey) {
    var name = personName(pid, famKey);
    showOverlay(
      overlayFormHTML(
        "Upload a photo &mdash; " + name,
        '<label style="display:block;font-size:12px;color:var(--muted);margin-bottom:4px;">Your name (optional)</label>' +
          '<input type="text" id="pName" class="search-input" style="width:100%;margin-bottom:10px;" placeholder="e.g. Fazil"/>' +
          '<label style="display:block;font-size:12px;color:var(--muted);margin-bottom:4px;">Photo</label>' +
          '<input type="file" id="pFile" accept="image/*" style="margin-bottom:10px;" required/>' +
          '<label style="display:block;font-size:12px;color:var(--muted);margin-bottom:4px;">Note (optional)</label>' +
          '<input type="text" id="pNote" class="search-input" style="width:100%;" placeholder="e.g. Taken at the 2019 wedding"/>'
      )
    );
    document.getElementById("quickForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var fileInput = document.getElementById("pFile");
      var file = fileInput.files && fileInput.files[0];
      if (!file) return;
      var submittedName = document.getElementById("pName").value.trim();
      var note = document.getElementById("pNote").value.trim();
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
})();
