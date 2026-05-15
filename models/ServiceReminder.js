const mongoose = require('mongoose');

const serviceReminderSchema = new mongoose.Schema({
  vehicle: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle', required: true },
  repair: { type: mongoose.Schema.Types.ObjectId, ref: 'Repair' },
  oilCard: { type: mongoose.Schema.Types.ObjectId, ref: 'OilCard' },
  serviceType: { type: String, required: true, default: 'Próximo servicio' },
  summary: String,
  dueDate: Date,
  dueKm: Number,
  source: { type: String, enum: ['repair','oil','manual'], default: 'manual' },
  status: { type: String, enum: ['pendiente','contactado','realizado','cancelado'], default: 'pendiente' },
  lastContactedAt: Date,
  notes: String
}, { timestamps: true });

module.exports = mongoose.model('ServiceReminder', serviceReminderSchema);
