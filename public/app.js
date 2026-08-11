(function(){
  "use strict";

  var people = [];
  var jobs = [];
  var blockedCompanies = {}; // personId -> [company, ...]
  var activePersonId = "p1";

  // A click within this window of the last completed search on the same profile
  // triggers a confirm() warning instead of running immediately — protects against
  // paying for a search that's very likely to just re-find what's already there.
  var SEARCH_COOLDOWN_MINUTES = 30;

  function fmtDate(iso){
    if(!iso) return "";
    var d = new Date(iso);
    return d.toLocaleDateString(undefined, { month:"short", day:"numeric" });
  }

  function timeAgo(iso){
    if(!iso) return "";
    var ms = Date.now() - new Date(iso).getTime();
    var min = Math.round(ms / 60000);
    if(min < 1) return "just now";
    if(min < 60) return min + " minute" + (min===1?"":"s") + " ago";
    var hrs = Math.round(min / 60);
    if(hrs < 24) return hrs + " hour" + (hrs===1?"":"s") + " ago";
    var days = Math.round(hrs / 24);
    return days + " day" + (days===1?"":"s") + " ago";
  }

  async function api(path, options){
    var res = await fetch(path, Object.assign({ headers: { "Content-Type": "application/json" } }, options));
    if(!res.ok){
      var body = {};
      try{ body = await res.json(); }catch(e){}
      throw new Error(body.error || ("Request failed: " + res.status));
    }
    if(res.status === 204) return null;
    return res.json();
  }

  async function loadState(){
    people = await api("/api/people");
    jobs = await api("/api/jobs");
    var lists = await Promise.all(people.map(function(p){ return api("/api/people/" + p.id + "/blocked-companies"); }));
    blockedCompanies = {};
    people.forEach(function(p, i){ blockedCompanies[p.id] = lists[i] || []; });
  }

  function getPerson(id){ return people.find(function(p){ return p.id === id; }); }
  function displayName(p){ return p.name && p.name.trim() ? p.name.trim() : (p.id === "p1" ? "Person 1" : "Person 2"); }
  function accentVar(p){ return p.color === "teal" ? "var(--teal)" : "var(--red)"; }

  function renderDateline(){
    var d = new Date();
    document.getElementById("dateline").textContent = d.toLocaleDateString(undefined, { weekday:"long", month:"long", day:"numeric", year:"numeric" });
  }

  function renderSettings(){
    var body = document.getElementById("settingsBody");
    body.innerHTML = "";
    people.forEach(function(p){
      var block = document.createElement("div");
      block.className = "person-settings";
      block.innerHTML =
        '<h3>' + (p.id === "p1" ? "Beat 1" : "Beat 2") + '</h3>' +
        '<div class="field"><label>Name</label><input data-field="name" data-person="'+p.id+'" value="'+escapeAttr(p.name)+'" placeholder="'+(p.id==="p1"?"You":"Partner")+'"></div>' +
        '<div class="field"><label>Beat label</label><input data-field="beatLabel" data-person="'+p.id+'" value="'+escapeAttr(p.beatLabel)+'"></div>' +
        '<div class="field"><label>Interest area</label><textarea data-field="interests" data-person="'+p.id+'">'+escapeAttr(p.interests)+'</textarea></div>' +
        '<div class="field"><label>Location preference</label><input data-field="location" data-person="'+p.id+'" value="'+escapeAttr(p.location)+'"></div>' +
        '<div class="field"><label>Seniority</label><input data-field="seniority" data-person="'+p.id+'" value="'+escapeAttr(p.seniority)+'"></div>' +
        '<div class="blocklist" data-blocklist-person="'+p.id+'"></div>';
      body.appendChild(block);
    });
    body.querySelectorAll("input,textarea").forEach(function(el){
      el.addEventListener("change", async function(){
        var personId = el.getAttribute("data-person");
        var field = el.getAttribute("data-field");
        var person = getPerson(personId);
        var previous = person[field];
        person[field] = el.value;
        renderTabs();
        renderContextStrip();
        try{
          await api("/api/people/" + personId, { method:"PUT", body: JSON.stringify({ [field]: el.value }) });
        }catch(err){
          console.error(err);
          person[field] = previous;
          el.value = previous;
          renderTabs();
          renderContextStrip();
          showStatus("Couldn't save that change. Check your connection.", true);
        }
      });
    });
    renderBlocklists();
  }

  function renderBlocklists(){
    people.forEach(function(p){
      var container = document.querySelector('[data-blocklist-person="'+p.id+'"]');
      if(!container) return;
      var list = blockedCompanies[p.id] || [];
      if(list.length === 0){
        container.innerHTML =
          '<div class="blocklist-label">Not interested in</div>' +
          '<div class="blocklist-empty">Nothing blocked — use "not a fit" on a search result to add one.</div>';
        return;
      }
      container.innerHTML =
        '<div class="blocklist-label">Not interested in</div>' +
        '<div class="blocklist-chips">' +
        list.map(function(company){
          return '<span class="blocklist-chip">'+escapeHtml(company)+
            '<button type="button" data-unblock-person="'+p.id+'" data-unblock-company="'+escapeAttr(company)+'" title="Stop blocking this employer">×</button></span>';
        }).join('') +
        '</div>';
    });
    document.querySelectorAll("[data-unblock-company]").forEach(function(btn){
      btn.addEventListener("click", async function(){
        var personId = btn.getAttribute("data-unblock-person");
        var company = btn.getAttribute("data-unblock-company");
        try{
          await api("/api/people/" + personId + "/blocked-companies/" + encodeURIComponent(company), { method:"DELETE" });
          blockedCompanies[personId] = (blockedCompanies[personId] || []).filter(function(c){ return c !== company; });
          renderBlocklists();
        }catch(err){
          console.error(err);
          showStatus("Couldn't update the blocklist. Check your connection.", true);
        }
      });
    });
  }

  function escapeAttr(s){ return (s||"").toString().replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;"); }
  function escapeHtml(s){ return escapeAttr(s); }

  function renderTabs(){
    var tabs = document.getElementById("tabs");
    tabs.innerHTML = "";
    people.forEach(function(p){
      var openCount = jobs.filter(function(j){ return j.personId === p.id && j.status === "open"; }).length;
      var btn = document.createElement("button");
      btn.className = "tab " + p.id + (p.id === activePersonId ? " active" : "");
      btn.innerHTML = escapeHtml(displayName(p)) + ' <span class="count">('+openCount+')</span><span class="beat">'+escapeHtml(p.beatLabel)+'</span>';
      btn.addEventListener("click", function(){
        activePersonId = p.id;
        renderAll();
      });
      tabs.appendChild(btn);
    });
  }

  function renderContextStrip(){
    var p = getPerson(activePersonId);
    document.getElementById("contextStrip").innerHTML =
      '<b>Looking for:</b> ' + escapeHtml(p.seniority) + ' &nbsp;·&nbsp; ' +
      '<b>Where:</b> ' + escapeHtml(p.location) + ' &nbsp;·&nbsp; ' +
      '<b>Also covers:</b> ' + escapeHtml(p.interests);
    document.getElementById("findLeadsBtn").style.background = accentVar(p);
    document.documentElement.style.setProperty("--accent", accentVar(p));
    renderLastSearched();
  }

  function renderLastSearched(){
    var p = getPerson(activePersonId);
    var el = document.getElementById("lastSearched");
    if(!p.lastSearchedAt){
      el.textContent = "Never searched yet on this profile.";
      el.classList.remove("recent");
      return;
    }
    var minsAgo = (Date.now() - new Date(p.lastSearchedAt).getTime()) / 60000;
    el.textContent = "Last searched " + timeAgo(p.lastSearchedAt) + ".";
    el.classList.toggle("recent", minsAgo < SEARCH_COOLDOWN_MINUTES);
  }

  // mode: "open" | "filed" | "candidate"
  function jobCardHTML(job, mode){
    var srcLabel = job.source === "wire" ? "WIRE" : "TIP";
    var srcClass = job.source === "wire" ? "src-wire" : "";
    var byline = [job.company, job.location].filter(Boolean).join(" — ");
    var actions = '';
    if(job.url){
      actions += '<a class="apply-link" href="'+escapeAttr(job.url)+'" target="_blank" rel="noopener noreferrer">Read the posting →</a>';
    }
    if(mode === "candidate"){
      actions += '<button class="link-btn add-to-board" data-action="promote" data-id="'+job.id+'">Add to board</button>';
      if(job.company){
        actions += '<button class="link-btn not-a-fit" data-action="notafit" data-id="'+job.id+'">not a fit</button>';
      } else {
        actions += '<button class="link-btn spike" data-action="spike" data-id="'+job.id+'">spike</button>';
      }
    } else if(mode === "filed"){
      actions += '<button class="link-btn" data-action="reopen" data-id="'+job.id+'">Reopen</button>';
      actions += '<button class="link-btn spike" data-action="spike" data-id="'+job.id+'">spike</button>';
    } else {
      actions += '<button class="link-btn mark-filed" data-action="file" data-id="'+job.id+'">Mark filed</button>';
      actions += '<button class="link-btn spike" data-action="spike" data-id="'+job.id+'">spike</button>';
    }

    return (
      '<div class="job-card'+(mode === "candidate" ? " job-card-candidate" : "")+'">' +
        '<div class="job-main">' +
          '<div class="eyebrow"><span class="'+srcClass+'">'+srcLabel+'</span><span>·</span><span>'+fmtDate(job.dateAdded)+'</span></div>' +
          '<div class="job-title">'+escapeHtml(job.title)+'</div>' +
          (byline ? '<div class="job-byline">'+escapeHtml(byline)+'</div>' : '') +
          (job.notes ? '<div class="job-notes">'+escapeHtml(job.notes)+'</div>' : '') +
          '<div class="job-actions">'+actions+'</div>' +
        '</div>' +
        (mode === "filed" ? '<div class="stamp">FILED '+fmtDate(job.dateFiled)+'</div>' : '') +
      '</div>'
    );
  }

  function renderJobs(){
    var candidates = jobs.filter(function(j){ return j.personId === activePersonId && j.status === "candidate"; })
                          .sort(function(a,b){ return (b.dateAdded||"").localeCompare(a.dateAdded||""); });
    var open = jobs.filter(function(j){ return j.personId === activePersonId && j.status === "open"; })
                    .sort(function(a,b){ return (b.dateAdded||"").localeCompare(a.dateAdded||""); });
    var filed = jobs.filter(function(j){ return j.personId === activePersonId && j.status === "filed"; })
                     .sort(function(a,b){ return (b.dateFiled||"").localeCompare(a.dateFiled||""); });

    var candidatesSection = document.getElementById("candidatesSection");
    var candidatesList = document.getElementById("candidatesList");
    document.getElementById("candidatesSummary").textContent = "Search results (" + candidates.length + ")";
    if(candidates.length === 0){
      candidatesSection.classList.add("hidden");
      candidatesList.innerHTML = "";
    } else {
      candidatesSection.classList.remove("hidden");
      candidatesList.innerHTML = candidates.map(function(j){ return jobCardHTML(j, "candidate"); }).join("");
    }

    var list = document.getElementById("jobList");
    if(open.length === 0){
      list.innerHTML = '<div class="empty-state">No open leads yet. Click "Find leads" to run a search, or file a tip you found yourself.</div>';
    } else {
      list.innerHTML = open.map(function(j){ return jobCardHTML(j, "open"); }).join("");
    }

    document.getElementById("filedSummary").textContent = "Filed (" + filed.length + ")";
    var filedList = document.getElementById("filedList");
    filedList.innerHTML = filed.length ? filed.map(function(j){ return jobCardHTML(j, "filed"); }).join("")
      : '<div class="empty-state">Nothing filed yet.</div>';

    candidatesList.querySelectorAll("[data-action]").forEach(bindJobAction);
    list.querySelectorAll("[data-action]").forEach(bindJobAction);
    filedList.querySelectorAll("[data-action]").forEach(bindJobAction);
  }

  function bindJobAction(el){
    el.addEventListener("click", async function(){
      var id = el.getAttribute("data-id");
      var action = el.getAttribute("data-action");
      var job = jobs.find(function(j){ return j.id === id; });
      if(!job) return;
      try{
        if(action === "promote"){
          await api("/api/jobs/" + id, { method:"PATCH", body: JSON.stringify({ status:"open" }) });
          job.status = "open";
        } else if(action === "file"){
          await api("/api/jobs/" + id, { method:"PATCH", body: JSON.stringify({ status:"filed" }) });
          job.status = "filed";
          job.dateFiled = new Date().toISOString();
        } else if(action === "reopen"){
          await api("/api/jobs/" + id, { method:"PATCH", body: JSON.stringify({ status:"open" }) });
          job.status = "open";
          job.dateFiled = null;
        } else if(action === "spike"){
          if(!confirm("Spike this lead? This removes it from the board.")) return;
          await api("/api/jobs/" + id, { method:"DELETE" });
          jobs = jobs.filter(function(j){ return j.id !== id; });
        } else if(action === "notafit"){
          if(!confirm('Discard this and stop suggesting jobs from "'+job.company+'" in future searches?')) return;
          await api("/api/jobs/" + id, { method:"DELETE", body: JSON.stringify({ blockCompany: job.company, personId: job.personId }) });
          jobs = jobs.filter(function(j){ return j.id !== id; });
          blockedCompanies[job.personId] = blockedCompanies[job.personId] || [];
          if(blockedCompanies[job.personId].indexOf(job.company) === -1){
            blockedCompanies[job.personId].push(job.company);
            blockedCompanies[job.personId].sort();
          }
          renderBlocklists();
        }
        renderTabs();
        renderJobs();
      }catch(err){
        console.error(err);
        showStatus("Couldn't save that change. Check your connection.", true);
      }
    });
  }

  function showStatus(msg, isError){
    var el = document.getElementById("statusMsg");
    el.textContent = msg || "";
    el.className = "status-msg" + (isError ? " error" : "");
  }

  function setLoading(isLoading){
    var btn = document.getElementById("findLeadsBtn");
    btn.disabled = isLoading;
    if(isLoading){
      btn.innerHTML = '<span class="loading-dot"></span>Working the wire…';
    } else {
      btn.textContent = "Find leads";
    }
  }

  async function findLeads(){
    var person = getPerson(activePersonId);

    if(person.lastSearchedAt){
      var minsAgo = (Date.now() - new Date(person.lastSearchedAt).getTime()) / 60000;
      if(minsAgo < SEARCH_COOLDOWN_MINUTES){
        var proceed = confirm(
          "You searched " + displayName(person) + "'s profile " + timeAgo(person.lastSearchedAt) + ". " +
          "Real postings rarely change that fast, so this search will likely just re-find what's already here (and it still costs the same either way).\n\n" +
          "Run it anyway?"
        );
        if(!proceed) return;
      }
    }

    setLoading(true);
    showStatus("");
    try{
      var result = await api("/api/find-leads", { method:"POST", body: JSON.stringify({ personId: person.id }) });
      person.lastSearchedAt = new Date().toISOString();
      renderLastSearched();
      if(result.added > 0){
        jobs = await api("/api/jobs");
        renderTabs();
        renderJobs();
      }
      showStatus(result.message, result.ok === false && result.added === 0 && !/live search/i.test(result.message) ? true : false);
    }catch(err){
      console.error(err);
      showStatus("Couldn't reach the wire. Try again in a moment.", true);
    }finally{
      setLoading(false);
    }
  }

  function openModal(){
    document.getElementById("modalPersonName").textContent = displayName(getPerson(activePersonId));
    document.getElementById("modalOverlay").classList.remove("hidden");
    document.getElementById("lookupStatus").textContent = "";
    document.getElementById("tipUrl").focus();
  }
  function closeModal(){
    document.getElementById("modalOverlay").classList.add("hidden");
    document.getElementById("tipForm").reset();
    document.getElementById("lookupStatus").textContent = "";
  }

  async function handleLookup(){
    var url = document.getElementById("tipUrl").value.trim();
    var statusEl = document.getElementById("lookupStatus");
    if(!url){
      statusEl.textContent = "Paste a URL above first.";
      statusEl.className = "lookup-status error";
      return;
    }
    statusEl.textContent = "Looking up…";
    statusEl.className = "lookup-status";
    try{
      var result = await api("/api/fetch-preview?url=" + encodeURIComponent(url));
      var titleEl = document.getElementById("tipTitle");
      var companyEl = document.getElementById("tipCompany");
      if(result.ok){
        var filledSomething = false;
        if(result.title && !titleEl.value.trim()){ titleEl.value = result.title; filledSomething = true; }
        if(result.company && !companyEl.value.trim()){ companyEl.value = result.company; filledSomething = true; }
        statusEl.textContent = filledSomething ? "Filled in what we could find — check it over." : "Couldn't find a title/company on that page — fill in by hand.";
        statusEl.className = "lookup-status";
      } else {
        statusEl.textContent = result.message || "Couldn't fetch that page — fill in by hand.";
        statusEl.className = "lookup-status error";
      }
    }catch(err){
      console.error(err);
      statusEl.textContent = "Couldn't fetch that page — fill in by hand.";
      statusEl.className = "lookup-status error";
    }
  }

  async function handleTipSubmit(e){
    e.preventDefault();
    var payload = {
      personId: activePersonId,
      title: document.getElementById("tipTitle").value.trim(),
      company: document.getElementById("tipCompany").value.trim(),
      location: document.getElementById("tipLocation").value.trim(),
      url: document.getElementById("tipUrl").value.trim(),
      notes: document.getElementById("tipNotes").value.trim()
    };
    try{
      var job = await api("/api/jobs", { method:"POST", body: JSON.stringify(payload) });
      jobs.push(job);
      closeModal();
      renderTabs();
      renderJobs();
    }catch(err){
      console.error(err);
      showStatus("Couldn't add that lead. Check your connection.", true);
    }
  }

  async function handleReset(){
    if(!confirm("Clear every lead from this shared board? This can't be undone.")) return;
    try{
      await api("/api/jobs", { method:"DELETE" });
      jobs = [];
      renderTabs();
      renderJobs();
    }catch(err){
      console.error(err);
      showStatus("Couldn't clear the board. Check your connection.", true);
    }
  }

  function csvField(v){
    var s = (v === null || v === undefined) ? "" : String(v);
    if(/[",\n]/.test(s)) s = '"' + s.replace(/"/g,'""') + '"';
    return s;
  }

  function handleExport(){
    var header = ["Person","Status","Source","Title","Company","Location","URL","Notes","Date added","Date filed"];
    var rows = jobs.map(function(j){
      var p = getPerson(j.personId);
      return [
        p ? displayName(p) : j.personId,
        j.status,
        j.source,
        j.title,
        j.company,
        j.location,
        j.url,
        j.notes,
        j.dateAdded || "",
        j.dateFiled || ""
      ].map(csvField).join(",");
    });
    var csv = header.map(csvField).join(",") + "\n" + rows.join("\n");
    var blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "lead-desk-export-" + new Date().toISOString().slice(0,10) + ".csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function renderAll(){
    // renderAll() only runs on init and on tab switch — clearing the status message here
    // (not inside findLeads' own render calls) stops a stale "N leads found" message from
    // a search on the OTHER person's tab from following you when you switch tabs.
    showStatus("");
    renderTabs();
    renderContextStrip();
    renderJobs();
  }

  async function init(){
    renderDateline();
    try{
      await loadState();
    }catch(err){
      console.error(err);
      showStatus("Couldn't load the board. Check your connection and refresh.", true);
      return;
    }
    renderSettings();
    renderAll();

    document.getElementById("findLeadsBtn").addEventListener("click", findLeads);
    document.getElementById("addTipBtn").addEventListener("click", openModal);
    document.getElementById("cancelTipBtn").addEventListener("click", closeModal);
    document.getElementById("modalOverlay").addEventListener("click", function(e){ if(e.target.id === "modalOverlay") closeModal(); });
    document.getElementById("tipForm").addEventListener("submit", handleTipSubmit);
    document.getElementById("lookupBtn").addEventListener("click", handleLookup);
    document.getElementById("resetBtn").addEventListener("click", handleReset);
    document.getElementById("exportBtn").addEventListener("click", handleExport);
  }

  init();
})();
