const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const cloudinary = require('cloudinary').v2;
const Vehicle = require('../models/Vehicle');
const Quote = require('../models/Quote');
const Repair = require('../models/Repair');
const OilCard = require('../models/OilCard');

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
  // Solo Repair tiene el campo `vehicle`. Antes se intentaba hacer populate('vehicle')
  // también sobre Vehicle, Quote y OilCard. En Mongoose 8 eso rompe la API.
  return Model.schema.path('vehicle') ? query.populate('vehicle') : query;
}

function calcRepairNumbers(data) {
  if (!data) return data;
  const partsCost = (data.partsChanged || []).reduce((s, p) => s + Number(p.cost || 0), 0);
  data.totalCost = partsCost + Number(data.externalCosts || 0);
  data.profit = Number(data.totalCharged || 0) - data.totalCost;
  if (data.status === 'entregado' && !data.deliveredAt) data.deliveredAt = new Date();
  return data;
}

const crud = (Model) => ({
  list: asyncHandler(async (req, res) => {
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
    const body = Model.modelName === 'Repair' ? calcRepairNumbers({ ...req.body }) : req.body;
    const doc = await Model.create(body);
    res.status(201).json(doc);
  }),

  update: asyncHandler(async (req, res) => {
    const body = Model.modelName === 'Repair' ? calcRepairNumbers({ ...req.body }) : req.body;
    const doc = await Model.findByIdAndUpdate(req.params.id, body, { new: true, runValidators: true });
    if (!doc) return res.status(404).json({ error: 'No encontrado' });
    res.json(doc);
  }),

  remove: asyncHandler(async (req, res) => {
    await Model.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  })
});

for (const [base, Model] of [
  ['vehicles', Vehicle],
  ['quotes', Quote],
  ['repairs', Repair],
  ['oil-cards', OilCard]
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
