(function(){
  "use strict";

  var people = [];
  var jobs = [];
  var activePersonId = "p1";

  function fmtDate(iso){
    if(!iso) return "";
    var d = new Date(iso);
    return d.toLocaleDateString(undefined, { month:"short", day:"numeric" });
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
        '<div class="field"><label>Seniority</label><input data-field="seniority" data-person="'+p.id+'" value="'+escapeAttr(p.seniority)+'"></div>';
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
  }

  function jobCardHTML(job, filed){
    var srcLabel = job.source === "wire" ? "WIRE" : "TIP";
    var srcClass = job.source === "wire" ? "src-wire" : "";
    var byline = [job.company, job.location].filter(Boolean).join(" — ");
    var actions = '';
    if(job.url){
      actions += '<a class="apply-link" href="'+escapeAttr(job.url)+'" target="_blank" rel="noopener noreferrer">Read the posting →</a>';
    }
    if(!filed){
      actions += '<button class="link-btn mark-filed" data-action="file" data-id="'+job.id+'">Mark filed</button>';
    } else {
      actions += '<button class="link-btn" data-action="reopen" data-id="'+job.id+'">Reopen</button>';
    }
    actions += '<button class="link-btn spike" data-action="spike" data-id="'+job.id+'">spike</button>';

    return (
      '<div class="job-card">' +
        '<div class="job-main">' +
          '<div class="eyebrow"><span class="'+srcClass+'">'+srcLabel+'</span><span>·</span><span>'+fmtDate(job.dateAdded)+'</span></div>' +
          '<div class="job-title">'+escapeHtml(job.title)+'</div>' +
          (byline ? '<div class="job-byline">'+escapeHtml(byline)+'</div>' : '') +
          (job.notes ? '<div class="job-notes">'+escapeHtml(job.notes)+'</div>' : '') +
          '<div class="job-actions">'+actions+'</div>' +
        '</div>' +
        (filed ? '<div class="stamp">FILED '+fmtDate(job.dateFiled)+'</div>' : '') +
      '</div>'
    );
  }

  function renderJobs(){
    var open = jobs.filter(function(j){ return j.personId === activePersonId && j.status === "open"; })
                    .sort(function(a,b){ return (b.dateAdded||"").localeCompare(a.dateAdded||""); });
    var filed = jobs.filter(function(j){ return j.personId === activePersonId && j.status === "filed"; })
                     .sort(function(a,b){ return (b.dateFiled||"").localeCompare(a.dateFiled||""); });

    var list = document.getElementById("jobList");
    if(open.length === 0){
      list.innerHTML = '<div class="empty-state">No open leads yet. Click "Find leads" to run a search, or file a tip you found yourself.</div>';
    } else {
      list.innerHTML = open.map(function(j){ return jobCardHTML(j, false); }).join("");
    }

    document.getElementById("filedSummary").textContent = "Filed (" + filed.length + ")";
    var filedList = document.getElementById("filedList");
    filedList.innerHTML = filed.length ? filed.map(function(j){ return jobCardHTML(j, true); }).join("")
      : '<div class="empty-state">Nothing filed yet.</div>';

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
        if(action === "file"){
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
    setLoading(true);
    showStatus("");
    try{
      var result = await api("/api/find-leads", { method:"POST", body: JSON.stringify({ personId: person.id }) });
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
    document.getElementById("tipTitle").focus();
  }
  function closeModal(){
    document.getElementById("modalOverlay").classList.add("hidden");
    document.getElementById("tipForm").reset();
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

  function renderAll(){
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
    document.getElementById("resetBtn").addEventListener("click", handleReset);
  }

  init();
})();
