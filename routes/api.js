const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const cloudinary = require('cloudinary').v2;
const Vehicle = require('../models/Vehicle');
const Quote = require('../models/Quote');
const Repair = require('../models/Repair');
const OilCard = require('../models/OilCard');
const ServiceReminder = require('../models/ServiceReminder');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

const cloudinaryEnabled = !!(
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET
);

if (cloudinaryEnabled) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });
}

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function maybePopulateVehicle(query, Model) {
  if (!Model.schema.path('vehicle')) return query;
  let q = query.populate('vehicle');
  if (Model.modelName === 'ServiceReminder') q = q.populate('repair').populate('oilCard');
  return q;
}

function addMonths(date, months){ const d = new Date(date || Date.now()); d.setMonth(d.getMonth() + months); return d; }
function inferServiceType(text){
  const t = String(text || '').toLowerCase();
  if(t.includes('aceite')) return 'Cambio de aceite';
  if(t.includes('freno') || t.includes('pastilla')) return 'Revisión de frenos';
  if(t.includes('correa') || t.includes('distribucion') || t.includes('distribución')) return 'Revisión de correa/distribución';
  if(t.includes('bujia') || t.includes('bujía')) return 'Revisión de bujías';
  return 'Control post reparación';
}
function defaultMonthsForService(type){ return type === 'Cambio de aceite' ? 6 : 3; }
async function upsertReminderFromRepair(repairId){
  const repair = await Repair.findById(repairId).populate('vehicle');
  if(!repair || repair.status !== 'entregado' || !repair.vehicle) return;
  const text = [repair.title, repair.diagnosis, repair.workDone, repair.extraProblems, ...(repair.partsChanged||[]).map(p => p.name)].join(' ');
  const serviceType = inferServiceType(text);
  const baseDate = repair.deliveredAt || new Date();
  const currentKm = Number(repair.vehicle.currentKm || 0);
  const dueKm = serviceType === 'Cambio de aceite' && currentKm ? currentKm + 10000 : undefined;
  await ServiceReminder.findOneAndUpdate(
    { repair: repair._id, source: 'repair' },
    { vehicle: repair.vehicle._id, repair: repair._id, source: 'repair', serviceType, summary: repair.title, dueDate: addMonths(baseDate, defaultMonthsForService(serviceType)), dueKm, status: 'pendiente' },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}
function escapeRegex(value){ return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
async function findVehicleForOilCard(oil){
  if(!oil) return null;
  if(oil.vehicle){
    const byId = await Vehicle.findById(oil.vehicle);
    if(byId) return byId;
  }
  const owner = String(oil.ownerName || '').trim();
  const brand = String(oil.brand || '').trim();
  const model = String(oil.model || '').trim();
  const candidates = [];
  if(owner && brand && model) candidates.push({ ownerName: new RegExp('^' + escapeRegex(owner) + '$', 'i'), brand: new RegExp(escapeRegex(brand), 'i'), model: new RegExp(escapeRegex(model), 'i') });
  if(owner && brand) candidates.push({ ownerName: new RegExp('^' + escapeRegex(owner) + '$', 'i'), brand: new RegExp(escapeRegex(brand), 'i') });
  if(owner) candidates.push({ ownerName: new RegExp('^' + escapeRegex(owner) + '$', 'i') });
  for(const query of candidates){
    const vehicle = await Vehicle.findOne(query);
    if(vehicle) return vehicle;
  }
  return null;
}
async function upsertReminderFromOilCard(oilCardId){
  const oil = await OilCard.findById(oilCardId);
  if(!oil) return;
  const vehicle = await findVehicleForOilCard(oil);
  if(!vehicle) return;
  if(!oil.vehicle){ oil.vehicle = vehicle._id; await oil.save(); }
  await ServiceReminder.findOneAndUpdate(
    { oilCard: oil._id, source: 'oil' },
    { vehicle: vehicle._id, oilCard: oil._id, source: 'oil', serviceType: 'Cambio de aceite', summary: `Cambio de aceite ${oil.oilUsed || ''}`.trim(), dueDate: addMonths(oil.date || oil.createdAt || new Date(), 6), dueKm: oil.nextKm, status: 'pendiente' },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}
async function ensureOilCardReminders(){
  const oilCards = await OilCard.find().sort({ createdAt: -1 }).limit(500);
  for(const oil of oilCards){ await upsertReminderFromOilCard(oil._id); }
}

async function nextQuoteNumber() {
  const last = await Quote.findOne({ quoteNumber: { $exists: true, $ne: null } }).sort({ quoteNumber: -1 }).select('quoteNumber');
  return Math.max(Number(last?.quoteNumber || 1031) + 1, 1032);
}
async function ensureExistingQuoteNumbers() {
  const missing = await Quote.find({ $or: [{ quoteNumber: { $exists: false } }, { quoteNumber: null }] }).sort({ createdAt: 1 });
  for (const q of missing) {
    q.quoteNumber = await nextQuoteNumber();
    await q.save();
  }
}

function calcRepairNumbers(data) {
  if (!data) return data;
  const partsCost = (data.partsChanged || []).reduce((s, p) => s + Number(p.cost || 0), 0);
  data.totalCost = partsCost + Number(data.externalCosts || 0);
  data.profit = Number(data.totalCharged || 0) - data.totalCost;
  if (data.status && !data.statusChangedAt) data.statusChangedAt = new Date();
  if (data.status === 'entregado' && !data.deliveredAt) data.deliveredAt = new Date();
  return data;
}

const crud = (Model) => ({
  list: asyncHandler(async (req, res) => {
    if (Model.modelName === 'Quote') await ensureExistingQuoteNumbers();
    if (Model.modelName === 'ServiceReminder') await ensureOilCardReminders();
    const query = Model.find().sort({ createdAt: -1 }).limit(300);
    const docs = await maybePopulateVehicle(query, Model);
    res.json(docs);
  }),

  get: asyncHandler(async (req, res) => {
    const query = Model.findById(req.params.id);
    const doc = await maybePopulateVehicle(query, Model);
    if (!doc) return res.status(404).json({ error: 'No encontrado' });
    res.json(doc);
  }),

  create: asyncHandler(async (req, res) => {
    const body = Model.modelName === 'Repair' ? calcRepairNumbers({ ...req.body }) : { ...req.body };
    if (Model.modelName === 'Quote' && !body.quoteNumber) body.quoteNumber = await nextQuoteNumber();
    const doc = await Model.create(body);
    if(Model.modelName === 'Repair') await upsertReminderFromRepair(doc._id);
    if(Model.modelName === 'OilCard') await upsertReminderFromOilCard(doc._id);
    res.status(201).json(doc);
  }),

  update: asyncHandler(async (req, res) => {
    const body = Model.modelName === 'Repair' ? calcRepairNumbers({ ...req.body }) : req.body;
    const doc = await Model.findByIdAndUpdate(req.params.id, body, { new: true, runValidators: true });
    if (!doc) return res.status(404).json({ error: 'No encontrado' });
    if(Model.modelName === 'Repair') await upsertReminderFromRepair(doc._id);
    if(Model.modelName === 'OilCard') await upsertReminderFromOilCard(doc._id);
    res.json(doc);
  }),

  remove: asyncHandler(async (req, res) => {
    const doc = await Model.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ error: 'No encontrado' });
    if (Model.modelName === 'Repair') await ServiceReminder.deleteMany({ repair: req.params.id });
    if (Model.modelName === 'OilCard') await ServiceReminder.deleteMany({ oilCard: req.params.id });
    res.json({ ok: true });
  })
});

for (const [base, Model] of [
  ['vehicles', Vehicle],
  ['quotes', Quote],
  ['repairs', Repair],
  ['oil-cards', OilCard],
  ['service-reminders', ServiceReminder]
]) {
  const c = crud(Model);
  router.get('/' + base, c.list);
  router.get('/' + base + '/:id', c.get);
  router.post('/' + base, c.create);
  router.put('/' + base + '/:id', c.update);
  router.delete('/' + base + '/:id', c.remove);
}

router.post('/repairs/:id/photos', upload.array('photos', 8), asyncHandler(async (req, res) => {
  if (!cloudinaryEnabled) return res.status(400).json({ error: 'Cloudinary no configurado' });

  const repair = await Repair.findById(req.params.id);
  if (!repair) return res.status(404).json({ error: 'Informe no encontrado' });

  const uploaded = [];
  for (const file of req.files || []) {
    const compressed = await sharp(file.buffer)
      .rotate()
      .resize({ width: 1400, withoutEnlargement: true })
      .jpeg({ quality: 72 })
      .toBuffer();

    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: 'bgarage/repairs', resource_type: 'image' },
        (err, r) => err ? reject(err) : resolve(r)
      );
      stream.end(compressed);
    });

    uploaded.push({ url: result.secure_url, publicId: result.public_id, caption: '' });
  }

  repair.photos.push(...uploaded);
  await repair.save();
  res.json({ ok: true, photos: uploaded, repair });
}));

router.get('/dashboard/summary', asyncHandler(async (req, res) => {
  const repairs = await Repair.find().sort({ createdAt: -1 }).populate('vehicle');
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();

  const delivered = repairs.filter(r => r.status === 'entregado');
  const monthRepairs = delivered.filter(r =>
    r.deliveredAt &&
    r.deliveredAt.getMonth() === month &&
    r.deliveredAt.getFullYear() === year
  );

  const sum = arr => arr.reduce((s, r) => s + Number(r.totalCharged || 0), 0);
  const cost = arr => arr.reduce((s, r) => s + Number(r.totalCost || 0), 0);
  const byStatus = repairs.reduce((a, r) => {
    a[r.status] = (a[r.status] || 0) + 1;
    return a;
  }, {});

  res.json({
    totalRepairs: repairs.length,
    byStatus,
    monthIncome: sum(monthRepairs),
    monthCost: cost(monthRepairs),
    monthProfit: sum(monthRepairs) - cost(monthRepairs),
    deliveredThisMonth: monthRepairs.length,
    recent: repairs.slice(0, 10)
  });
}));

router.use((err, req, res, next) => {
  console.error('API error:', err);
  res.status(500).json({ error: err.message || 'Error del servidor' });
});

module.exports = router;
