/* Updated script.js — date validation added, glassware nav fix supported by HTML changes.
   Kept original behavior & PIN auth; added clear validations and better table rendering.
*/

/* ---------- Data storage & initial setup ---------- */
const STORAGE_KEY = "lab_inventory_v1"
let store = {
  chemicals: [],
  glassware: [],
  instruments: [],
  misc: [],
  settings: { lowThreshold: 10, nearExpiryDays: 30, pin: "9999" },
}

function loadStore() {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    // First run: initialize empty categories
    saveStore()
  } else {
    try {
      store = JSON.parse(raw)
      // ensure settings exist and pin default present
      store.settings = store.settings || {}
      if (store.settings.lowThreshold == null) store.settings.lowThreshold = 10
      if (store.settings.nearExpiryDays == null) store.settings.nearExpiryDays = 30
      if (store.settings.pin == null) store.settings.pin = "9999"
    } catch (e) {
      console.error("parse store", e)
      saveStore()
    }
  }
}
function saveStore() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

/* ---------- DOM helpers ---------- */
const qs = (sel) => document.querySelector(sel)
const qsa = (sel) => Array.from(document.querySelectorAll(sel))
function $(id) {
  return document.getElementById(id)
}

/* ---------- Utility: date helpers ---------- */
function todayDMY() {
  const d = new Date()
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`
}
function parseDMY(dmy) {
  if (!dmy) return null
  const parts = dmy.split("/")
  if (parts.length !== 3) return null
  const dd = Number.parseInt(parts[0], 10),
    mm = Number.parseInt(parts[1], 10),
    yy = Number.parseInt(parts[2], 10)
  if (isNaN(dd) || isNaN(mm) || isNaN(yy)) return null
  return new Date(yy, mm - 1, dd)
}
function zeroTime(d) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function isFutureDate(dmy) {
  const dt = parseDMY(dmy)
  if (!dt) return false
  return zeroTime(dt) > zeroTime(new Date())
}
function isBeforeDate(dmyA, dmyB) {
  const a = parseDMY(dmyA),
    b = parseDMY(dmyB)
  if (!a || !b) return false
  return zeroTime(a) < zeroTime(b)
}
function daysBetween(a, b) {
  return Math.ceil((b - a) / (1000 * 60 * 60 * 24))
}
function daysToExpiry(expiryDMY) {
  const exp = parseDMY(expiryDMY)
  if (!exp) return null
  return daysBetween(zeroTime(new Date()), zeroTime(exp))
}

/* ---------- UI: Tab navigation & home ---------- */
function activateView(name) {
  qsa(".view").forEach((v) => v.classList.remove("active"))
  const el = document.getElementById(name)
  if (el) el.classList.add("active")

  // nav highlight
  qsa(".tabbtn").forEach((b) => b.classList.remove("active"))
  qsa(`.tabbtn[data-target="${name}"]`).forEach((b) => b.classList.add("active"))

  if (name === "allitems") renderAllItems()
  if (["chemicals", "glassware", "instruments", "misc"].includes(name)) renderCategory(name)
}
qsa(".tabbtn").forEach((b) => {
  b.addEventListener("click", () => activateView(b.dataset.target))
})
qsa(".tile").forEach((t) => {
  t.addEventListener("click", () => {
    const target = t.dataset.open
    activateView(target)
  })
})

/* ---------- Settings inputs ---------- */
function attachSettingsUI() {
  const ltEl = $("global-low-threshold")
  const ndEl = $("global-near-expiry")
  if (ltEl) ltEl.value = store.settings.lowThreshold
  if (ndEl) ndEl.value = store.settings.nearExpiryDays

  const saveBtn = $("save-settings")
  if (saveBtn) {
    saveBtn.addEventListener("click", () => {
      const lt = Number.parseFloat($("global-low-threshold").value)
      const nd = Number.parseInt($("global-near-expiry").value, 10)
      if (!isNaN(lt)) store.settings.lowThreshold = lt
      if (!isNaN(nd)) store.settings.nearExpiryDays = nd
      saveStore()
      alert("Settings saved.")
    })
  }
}

/* ---------- Authorization: PIN ---------- */
function requestPin() {
  const attempt = prompt("Enter PIN to authorize this action:")
  if (attempt === null) return false // cancelled
  if (String(attempt) === String(store.settings.pin)) return true
  alert("Incorrect PIN")
  return false
}

function changePinFlow() {
  const cur = prompt("Enter current PIN:")
  if (cur === null) return
  if (String(cur) !== String(store.settings.pin)) {
    alert("Incorrect current PIN. PIN not changed.")
    return
  }
  const newPin = prompt("Enter new PIN (numbers or text):")
  if (newPin === null) return
  if (String(newPin).trim() === "") {
    alert("PIN cannot be empty.")
    return
  }
  const confirmPin = prompt("Confirm new PIN:")
  if (confirmPin === null) return
  if (newPin !== confirmPin) {
    alert("PINs do not match. Try again.")
    return
  }
  store.settings.pin = String(newPin)
  saveStore()
  alert("PIN changed successfully.")
}

/* ---------- Render functions ---------- */
function renderCategory(cat) {
  const tbl = $(`${cat}-table`)
  const areaEmpty = $(`${cat}-empty`)
  const arr = store[cat] || []
  const searchVal = $(`search-${cat}`).value.trim().toLowerCase()

  // filter
  const rows = arr
    .map((it, idx) => ({ it, idx }))
    .filter((r) => {
      if (!searchVal) return true
      return Object.values(r.it).some((v) =>
        String(v || "")
          .toLowerCase()
          .includes(searchVal),
      )
    })

  if (rows.length === 0) {
    if (areaEmpty) areaEmpty.style.display = "block"
    if (tbl) tbl.innerHTML = ""
    return
  } else {
    if (areaEmpty) areaEmpty.style.display = "none"
  }

  // build header depending on category
  let headers = []
  if (cat === "chemicals")
    headers = ["Name", "State", "Quantity", "Unit", "Purchase", "Expiry", "Location", "Image", "Alerts", "Actions"]
  else
    headers = ["Name", "Specifications", "Quantity", "Status", "Purchased On", "Location", "Image", "Alerts", "Actions"]

  const thead = `<thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead>`
  const tbody = rows
    .map((r) => {
      const it = r.it
      let isLow = false,
        isNear = false
      const qtyNum = Number.parseFloat(it.quantity) || 0
      const threshold = it.threshold != null ? it.threshold : store.settings.lowThreshold
      if (!isNaN(threshold) && qtyNum <= threshold) isLow = true

      const days = it.expiry ? daysToExpiry(it.expiry) : null
      if (days !== null && days <= store.settings.nearExpiryDays && days >= 0) isNear = true

      const alertHtml =
        `${isLow ? '<span class="small">⚠️ Low</span>' : ""} ${isNear ? '<span class="small">⚠️ Near expiry</span>' : ""}`.trim()
      const imgCell = it.image ? `<img src="${it.image}" class="thumb" alt="img"/>` : "—"
      const rowClass = (isLow ? "row-low" : "") + (isNear ? " row-near" : "")
      let row = `<tr class="${rowClass}">`
      if (cat === "chemicals") {
        row += `<td class="clickable" data-cat="${cat}" data-idx="${r.idx}">${escapeHtml(it.name)}</td>`
        row += `<td>${escapeHtml(it.state)}</td>`
        row += `<td>${escapeHtml(it.quantity)}</td>`
        row += `<td>${escapeHtml(it.unit || "")}</td>`
        row += `<td>${escapeHtml(it.purchase || "")}</td>`
        row += `<td>${escapeHtml(it.expiry || "")}</td>`
        row += `<td>${escapeHtml(it.location || "")}</td>`
        row += `<td>${imgCell}</td>`
        row += `<td>${alertHtml}</td>`
        row += `<td><button class="btn small" data-action="consume" data-cat="${cat}" data-idx="${r.idx}">Consume</button>
                 <button class="btn small" data-action="edit" data-cat="${cat}" data-idx="${r.idx}">Edit</button>
                 <button class="btn small muted" data-action="log" data-cat="${cat}" data-idx="${r.idx}">Log</button>
                 <button class="btn small danger" data-action="delete" data-cat="${cat}" data-idx="${r.idx}">Delete</button>
              </td>`
      } else {
        row += `<td class="clickable" data-cat="${cat}" data-idx="${r.idx}">${escapeHtml(it.name)}</td>`
        row += `<td>${escapeHtml(it.specs || "")}</td>`
        row += `<td>${escapeHtml(it.quantity)}</td>`
        row += `<td>${escapeHtml(it.status || "")}</td>`
        row += `<td>${escapeHtml(it.purchase || "")}</td>`
        row += `<td>${escapeHtml(it.location || "")}</td>`
        row += `<td>${imgCell}</td>`
        row += `<td>${alertHtml}</td>`
        row += `<td><button class="btn small" data-action="damage" data-cat="${cat}" data-idx="${r.idx}">Breakage</button>
                 <button class="btn small" data-action="edit" data-cat="${cat}" data-idx="${r.idx}">Edit</button>
                 <button class="btn small muted" data-action="log" data-cat="${cat}" data-idx="${r.idx}">Log</button>
                 <button class="btn small danger" data-action="delete" data-cat="${cat}" data-idx="${r.idx}">Delete</button>
              </td>`
      }
      row += "</tr>"
      return row
    })
    .join("")

  // Fill the existing table element (avoid nested table markup)
  if (tbl) tbl.innerHTML = thead + `<tbody>${tbody}</tbody>`
  attachTableHandlers(cat)
}

/* ---------- Table handlers (row click, buttons) ---------- */
function attachTableHandlers(cat) {
  // clickable name: show details w/ image if any
  qsa(`#${cat}-table .clickable`).forEach((td) => {
    td.addEventListener("click", () => {
      const idx = td.dataset.idx
      showDetailsModal(cat, Number.parseInt(idx, 10))
    })
  })

  // action buttons: consume/damage/edit/delete/log
  qsa(`#${cat}-table button`).forEach((btn) => {
    const action = btn.dataset.action
    const catName = btn.dataset.cat
    const idx = Number.parseInt(btn.dataset.idx, 10)

    if (action === "consume") {
      btn.addEventListener("click", () => {
        if (!requestPin()) return
        openConsumeDialog(catName, idx)
      })
    }
    if (action === "damage") {
      btn.addEventListener("click", () => {
        if (!requestPin()) return
        openDamageDialog(catName, idx)
      })
    }
    if (action === "delete") {
      btn.addEventListener("click", () => {
        if (!requestPin()) return
        if (confirm("Delete item?")) {
          store[catName].splice(idx, 1)
          saveStore()
          renderCategory(catName)
        }
      })
    }
    if (action === "edit") {
      btn.addEventListener("click", () => {
        if (!requestPin()) return
        openEditForm(catName, idx)
      })
    }
    if (action === "log") {
      btn.addEventListener("click", () => showLogModal(catName, idx))
    }
  })
}

/* ---------- Details modal (image + info) ---------- */
function showDetailsModal(cat, idx) {
  const item = store[cat][idx]
  const modal = $("details-modal")
  $("details-title").innerText = `${item.name || "Item"} — details`
  const body = $("details-body")
  body.innerHTML = ""
  const dl = document.createElement("div")
  dl.className = "small"
  for (const key of Object.keys(item)) {
    if (key === "image") continue
    const row = document.createElement("div")
    row.innerHTML = `<strong>${escapeHtml(key)}:</strong> ${escapeHtml(item[key])}`
    dl.appendChild(row)
  }
  body.appendChild(dl)
  if (item.image) {
    const img = document.createElement("img")
    img.src = item.image
    img.className = "thumb"
    body.appendChild(img)
  } else {
    const p = document.createElement("div")
    p.className = "small"
    p.style.marginTop = "8px"
    p.textContent = "No image available for this item."
    body.appendChild(p)
  }
  modal.classList.remove("hidden")
  $("close-details").onclick = () => modal.classList.add("hidden")
}

/* ---------- Add / Edit Form modal ---------- */
function openAddForm(cat) {
  openFormModal(cat, null)
}
function openEditForm(cat, idx) {
  openFormModal(cat, idx)
}

function openFormModal(cat, idx) {
  const modal = $("form-modal")
  $("form-title").innerText = idx == null ? `Add item — ${capitalize(cat)}` : `Edit item — ${capitalize(cat)}`
  $("item-id").value = idx == null ? "" : idx
  const fields = $("form-fields")
  fields.innerHTML = ""

  if (cat === "chemicals") {
    fields.innerHTML = `
      <label>Name <input id="f-name" required /></label>
      <label>State <select id="f-state"><option>solid</option><option>liquid</option><option>gas</option></select></label>
      <label>Quantity (numeric) <input id="f-quantity" type="number" step="any" required /></label>
      <label>Unit <select id="f-unit"><option>g</option><option>mL</option><option>L</option><option>pcs</option><option>other</option></select></label>
      <label>Reorder threshold (optional) <input id="f-threshold" type="number" step="any" /></label>
      <label>Purchase date (DD/MM/YYYY) <input id="f-purchase" placeholder="DD/MM/YYYY" /></label>
      <label>Expiry date (DD/MM/YYYY) <input id="f-expiry" placeholder="DD/MM/YYYY" /></label>
      <label>Location <input id="f-location" /></label>
      <label>Attach image (PNG/JPG) <input id="f-image" type="file" accept="image/png,image/jpeg" /></label>
      <div id="f-image-preview"></div>
    `
  } else {
    fields.innerHTML = `
      <label>Name <input id="f-name" required /></label>
      <label>Specifications <input id="f-specs" /></label>
      <label>Quantity (numeric) <input id="f-quantity" type="number" step="1" required /></label>
      <label>Status <select id="f-status"><option>Working</option><option>Non-functional</option><option>Needs repair</option></select></label>
      <label>Purchased on (DD/MM/YYYY) <input id="f-purchase" placeholder="DD/MM/YYYY" /></label>
      <label>Location <input id="f-location" /></label>
      <label>Attach image (PNG/JPG) <input id="f-image" type="file" accept="image/png,image/jpeg" /></label>
      <div id="f-image-preview"></div>
    `
  }

  // If editing populate fields
  if (idx != null) {
    const it = store[cat][idx]
    if (cat === "chemicals") {
      $("f-name").value = it.name || ""
      $("f-state").value = it.state || "solid"
      $("f-quantity").value = it.quantity || 0
      $("f-unit").value = it.unit || "g"
      $("f-threshold").value = it.threshold != null ? it.threshold : ""
      $("f-purchase").value = it.purchase || ""
      $("f-expiry").value = it.expiry || ""
      $("f-location").value = it.location || ""
      if (it.image) showPreview(it.image)
    } else {
      $("f-name").value = it.name || ""
      $("f-specs").value = it.specs || ""
      $("f-quantity").value = it.quantity || 0
      $("f-status").value = it.status || "Working"
      $("f-purchase").value = it.purchase || todayDMY()
      $("f-location").value = it.location || ""
      if (it.image) showPreview(it.image)
    }
  } else {
    // default purchase date for non-chemicals is today
    if (cat !== "chemicals") $("f-purchase").value = todayDMY()
  }

  // image preview helper
  function showPreview(dataUrl) {
    const wrap = $("f-image-preview")
    if (!wrap) return
    wrap.innerHTML = ""
    const img = document.createElement("img")
    img.src = dataUrl
    img.className = "thumb"
    wrap.appendChild(img)
    const fileInput = $("f-image")
    if (fileInput) fileInput.dataset.preview = dataUrl
  }

  // file input change -> read dataURL
  const fileInputs = fields.querySelectorAll('input[type="file"]')
  fileInputs.forEach((inp) => {
    inp.onchange = async (e) => {
      const f = e.target.files[0]
      if (!f) return
      if (!/^image\/(png|jpeg)$/.test(f.type)) {
        alert("Only PNG/JPG allowed")
        inp.value = ""
        return
      }
      const dataUrl = await readFileAsDataURL(f)
      inp.dataset.preview = dataUrl
      showPreview(dataUrl)
    }
  })

  // submit handler
  const form = $("item-form")
  form.onsubmit = (ev) => {
    ev.preventDefault()
    const editIdx = $("item-id").value !== "" ? Number.parseInt($("item-id").value, 10) : null

    // ---- date validations ----
    const purchaseVal = $("f-purchase") ? $("f-purchase").value.trim() : ""
    if (purchaseVal) {
      if (isFutureDate(purchaseVal)) {
        alert("Purchase date cannot be in the future. Please correct the date before saving.")
        return
      }
    }

    const expiryVal = $("f-expiry") ? $("f-expiry").value.trim() : ""
    if (expiryVal && purchaseVal) {
      if (isBeforeDate(expiryVal, purchaseVal)) {
        alert("Expiry date cannot be before the purchase date. Please correct the dates.")
        return
      }
    }

    if (cat === "chemicals") {
      const item = {
        name: $("f-name").value.trim(),
        state: $("f-state").value,
        quantity: Number.parseFloat($("f-quantity").value) || 0,
        unit: $("f-unit").value,
        threshold: $("f-threshold").value ? Number.parseFloat($("f-threshold").value) : null,
        purchase: $("f-purchase").value || "",
        expiry: $("f-expiry").value || "",
        location: $("f-location").value || "",
        image: ($("f-image") && $("f-image").dataset.preview) || null,
        consumptionLog: editIdx != null && store[cat][editIdx].consumptionLog ? store[cat][editIdx].consumptionLog : [],
      }
      if (editIdx != null) store[cat][editIdx] = item
      else store[cat].push(item)
    } else {
      const item = {
        name: $("f-name").value.trim(),
        specs: $("f-specs") ? $("f-specs").value : "",
        quantity: Number.parseInt($("f-quantity").value, 10) || 0,
        status: $("f-status").value,
        purchase: $("f-purchase").value || todayDMY(),
        location: $("f-location").value || "",
        image: ($("f-image") && $("f-image").dataset.preview) || null,
        damageLog: editIdx != null && store[cat][editIdx].damageLog ? store[cat][editIdx].damageLog : [],
      }
      if (editIdx != null) store[cat][editIdx] = item
      else store[cat].push(item)
    }
    saveStore()
    modalCloseForm()
    renderCategory(cat)
  }

  // cancel
  $("cancel-form").onclick = modalCloseForm

  modalShowForm()
}

/* ---------- modal helpers ---------- */
function modalShowForm() {
  $("form-modal").classList.remove("hidden")
}
function modalCloseForm() {
  $("form-modal").classList.add("hidden")
  $("form-fields").innerHTML = ""
}

/* ---------- Read file helper ---------- */
function readFileAsDataURL(file) {
  return new Promise((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(r.result)
    r.onerror = rej
    r.readAsDataURL(file)
  })
}

/* ---------- Consume / Damage dialogs (now PIN-protected via attachTableHandlers) ---------- */
function openConsumeDialog(cat, idx) {
  const it = store[cat][idx]
  const amtStr = prompt(`Enter amount consumed (current balance: ${it.quantity} ${it.unit || ""})`)
  if (!amtStr) return
  const amt = Number.parseFloat(amtStr)
  if (isNaN(amt) || amt <= 0) {
    alert("Invalid amount")
    return
  }
  let dateInput = prompt("Enter date (DD/MM/YYYY) or leave blank for today:") || todayDMY()
  if (isFutureDate(dateInput)) {
    alert("Date cannot be in the future — using today's date instead.")
    dateInput = todayDMY()
  }
  const beforeQty = Number.parseFloat(it.quantity) || 0
  const afterQty = Math.max(beforeQty - amt, 0)
  it.quantity = afterQty
  it.consumptionLog = it.consumptionLog || []
  it.consumptionLog.push({ date: dateInput, amount: amt, original: beforeQty, balance: afterQty })
  saveStore()
  renderCategory(cat)
  alert(`Consumed ${amt}. New balance: ${it.quantity} ${it.unit || ""}`)
}

function openDamageDialog(cat, idx) {
  const it = store[cat][idx]
  const amtStr = prompt(`Enter quantity broken/damaged (current: ${it.quantity})`)
  if (!amtStr) return
  const amt = Number.parseInt(amtStr, 10)
  if (isNaN(amt) || amt <= 0) {
    alert("Invalid amount")
    return
  }
  let dateInput = prompt("Enter date (DD/MM/YYYY) or leave blank for today:") || todayDMY()
  if (isFutureDate(dateInput)) {
    alert("Date cannot be in the future — using today's date instead.")
    dateInput = todayDMY()
  }
  const beforeQty = Number.parseInt(it.quantity, 10) || 0
  const newQty = beforeQty - amt
  it.quantity = newQty < 0 ? 0 : newQty
  it.damageLog = it.damageLog || []
  it.damageLog.push({ date: dateInput, original: beforeQty, amount: amt, balance: it.quantity })
  saveStore()
  renderCategory(cat)
  alert(`Recorded damage of ${amt}. New balance: ${it.quantity}`)
}

/* ---------- Logs modal (shows expanded damage log with original/broken/balance) ---------- */
function showLogModal(cat, idx) {
  const it = store[cat][idx]
  const modal = $("details-modal")
  $("details-title").innerText = `${it.name} — Log`
  const body = $("details-body")
  body.innerHTML = ""
  if (it.consumptionLog && it.consumptionLog.length) {
    const h = document.createElement("div")
    h.innerHTML = "<strong>Consumption Log</strong>"
    body.appendChild(h)
    it.consumptionLog
      .slice()
      .reverse()
      .forEach((l) => {
        const d = document.createElement("div")
        if (l.original != null) {
          d.textContent = `${l.date}: original ${l.original} → consumed ${l.amount} → balance ${l.balance}`
        } else {
          d.textContent = `${l.date}: ${l.amount}`
        }
        body.appendChild(d)
      })
  }
  if (it.damageLog && it.damageLog.length) {
    const h2 = document.createElement("div")
    h2.innerHTML = "<strong>Breakage Log</strong>"
    body.appendChild(h2)
    it.damageLog
      .slice()
      .reverse()
      .forEach((l) => {
        const d = document.createElement("div")
        if (l.original != null) {
          d.textContent = `${l.date}: original ${l.original} → broken ${l.amount} → balance ${l.balance}`
        } else {
          d.textContent = `${l.date}: ${l.amount}`
        }
        body.appendChild(d)
      })
  }
  if ((!it.consumptionLog || !it.consumptionLog.length) && (!it.damageLog || !it.damageLog.length)) {
    const p = document.createElement("div")
    p.textContent = "No log records for this item."
    body.appendChild(p)
  }
  modal.classList.remove("hidden")
  $("close-details").onclick = () => modal.classList.add("hidden")
}

/* ---------- Attach Add buttons ---------- */
function attachAddButtons() {
  const ca = $("add-chemical-btn")
  if (ca) ca.addEventListener("click", () => openAddForm("chemicals"))
  const ga = $("add-glassware-btn")
  if (ga) ga.addEventListener("click", () => openAddForm("glassware"))
  const ia = $("add-instrument-btn")
  if (ia) ia.addEventListener("click", () => openAddForm("instruments"))
  const ma = $("add-misc-btn")
  if (ma) ma.addEventListener("click", () => openAddForm("misc"))
}

/* ---------- CSV Export & Print ---------- */
function exportCSV(category) {
  const rows = []
  if (category === "all") {
    rows.push(["Category", "Name", "Quantity", "Unit/Specs", "Location", "Purchased", "Expiry", "Status"])
    ;["chemicals", "glassware", "instruments", "misc"].forEach((cat) => {
      ;(store[cat] || []).forEach((it) => {
        if (cat === "chemicals")
          rows.push([
            cat,
            it.name,
            it.quantity,
            it.unit || "",
            it.location || "",
            it.purchase || "",
            it.expiry || "",
            "",
          ])
        else
          rows.push([
            cat,
            it.name,
            it.quantity,
            it.specs || "",
            it.location || "",
            it.purchase || "",
            "",
            it.status || "",
          ])
      })
    })
  } else {
    if (category === "chemicals") {
      rows.push(["Name", "Quantity", "Unit", "Purchase", "Expiry", "Location"])
      ;(store.chemicals || []).forEach((it) =>
        rows.push([it.name, it.quantity, it.unit || "", it.purchase || "", it.expiry || "", it.location || ""]),
      )
    } else {
      rows.push(["Name", "Specifications", "Quantity", "Status", "Purchase", "Location"])
      ;(store[category] || []).forEach((it) =>
        rows.push([it.name, it.specs || "", it.quantity, it.status || "", it.purchase || "", it.location || ""]),
      )
    }
  }
  const csv = rows.map((r) => r.map((c) => `"${String(c || "").replace(/"/g, '""')}"`).join(",")).join("\n")
  const blob = new Blob([csv], { type: "text/csv" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `${category}_export.csv`
  a.click()
  URL.revokeObjectURL(url)
}
qsa("button[data-export]").forEach((b) => b.addEventListener("click", () => exportCSV(b.dataset.export)))
qsa("button[data-print]").forEach((b) => b.addEventListener("click", () => printCategory(b.dataset.print)))

function printCategory(category) {
  const win = window.open("", "_blank")
  let html =
    "<html><head><title>Print</title><style>table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:8px;text-align:left}</style></head><body>"
  if (category === "all") {
    html +=
      "<h2>All Items</h2><table><thead><tr><th>Category</th><th>Name</th><th>Quantity</th><th>Location</th></tr></thead><tbody>"
    ;["chemicals", "glassware", "instruments", "misc"].forEach((cat) => {
      ;(store[cat] || []).forEach((it) => {
        html += `<tr><td>${capitalize(cat)}</td><td>${escapeHtml(it.name)}</td><td>${escapeHtml(it.quantity)}</td><td>${escapeHtml(it.location || "")}</td></tr>`
      })
    })
    html += "</tbody></table>"
  } else {
    html += `<h2>${capitalize(category)}</h2><table><thead><tr>`
    if (category === "chemicals")
      html +=
        "<th>Name</th><th>Qty</th><th>Unit</th><th>Purchase</th><th>Expiry</th><th>Location</th></tr></thead><tbody>"
    else
      html +=
        "<th>Name</th><th>Specs</th><th>Qty</th><th>Status</th><th>Purchase</th><th>Location</th></tr></thead><tbody>"
    ;(store[category] || []).forEach((it) => {
      if (category === "chemicals")
        html += `<tr><td>${escapeHtml(it.name)}</td><td>${escapeHtml(it.quantity)}</td><td>${escapeHtml(it.unit || "")}</td><td>${escapeHtml(it.purchase || "")}</td><td>${escapeHtml(it.expiry || "")}</td><td>${escapeHtml(it.location || "")}</td></tr>`
      else
        html += `<tr><td>${escapeHtml(it.name)}</td><td>${escapeHtml(it.specs || "")}</td><td>${escapeHtml(it.quantity)}</td><td>${escapeHtml(it.status || "")}</td><td>${escapeHtml(it.purchase || "")}</td><td>${escapeHtml(it.location || "")}</td></tr>`
    })
    html += "</tbody></table>"
  }
  html += "</body></html>"
  win.document.write(html)
  win.document.close()
  setTimeout(() => win.print(), 300)
}

/* ---------- All items render ---------- */
function renderAllItems() {
  const tblWrap = $("all-table")
  let html = "<thead><tr><th>Category</th><th>Name</th><th>Quantity</th><th>Location</th></tr></thead><tbody>"
  ;["chemicals", "glassware", "instruments", "misc"].forEach((cat) => {
    ;(store[cat] || []).forEach((it) => {
      html += `<tr><td>${capitalize(cat)}</td><td>${escapeHtml(it.name)}</td><td>${escapeHtml(it.quantity)}</td><td>${escapeHtml(it.location || "")}</td></tr>`
    })
  })
  html += "</tbody>"
  if (tblWrap) tblWrap.innerHTML = html
}

/* ---------- Helpers ---------- */
function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

/* ---------- Search inputs (live) for categories ---------- */
function attachSearchInputs() {
  const sc = $("search-chemicals")
  if (sc) sc.addEventListener("input", () => renderCategory("chemicals"))
  const sg = $("search-glassware")
  if (sg) sg.addEventListener("input", () => renderCategory("glassware"))
  const si = $("search-instruments")
  if (si) si.addEventListener("input", () => renderCategory("instruments"))
  const sm = $("search-misc")
  if (sm) sm.addEventListener("input", () => renderCategory("misc"))
}

/* ---------- General Home search (search across categories) ---------- */
function searchAllHandler() {
  const q = $("search-all").value.trim().toLowerCase()
  const resultsDiv = $("home-search-results")
  if (!q) {
    resultsDiv.style.display = "none"
    resultsDiv.innerHTML = ""
    return
  }
  let html =
    '<table class="data-table"><thead><tr><th>Category</th><th>Name</th><th>Qty</th><th>Location</th><th></th></tr></thead><tbody>'
  ;["chemicals", "glassware", "instruments", "misc"].forEach((cat) => {
    ;(store[cat] || []).forEach((it, idx) => {
      const matches = Object.values(it).some((v) =>
        String(v || "")
          .toLowerCase()
          .includes(q),
      )
      if (matches) {
        html += `<tr><td>${capitalize(cat)}</td><td>${escapeHtml(it.name)}</td><td>${escapeHtml(it.quantity)}</td><td>${escapeHtml(it.location || "")}</td><td><button class="btn small" data-action="view" data-cat="${cat}" data-idx="${idx}">Details</button></td></tr>`
      }
    })
  })
  html += "</tbody></table>"
  resultsDiv.style.display = "block"
  resultsDiv.innerHTML = html
  qsa('#home-search-results button[data-action="view"]').forEach((b) => {
    b.addEventListener("click", () => {
      const cat = b.dataset.cat
      const idx = Number.parseInt(b.dataset.idx, 10)
      showDetailsModal(cat, idx)
    })
  })
}
function attachHomeSearch() {
  const sa = $("search-all")
  if (sa) sa.addEventListener("input", searchAllHandler)
}

/* ---------- initial empty-first-run check + attach buttons ---------- */
function init() {
  loadStore()
  attachSettingsUI()
  attachAddButtons()
  attachSearchInputs()
  attachHomeSearch()

  // Change PIN button
  const changePinBtn = $("change-pin")
  if (changePinBtn) {
    changePinBtn.addEventListener("click", changePinFlow)
  }

  // Show home by default
  activateView("home")
}
init()
