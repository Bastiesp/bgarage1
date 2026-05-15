const mongoose = require('mongoose');
const quoteSchema = new mongoose.Schema({
  vehicle: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle' },
  ownerName: String, vehicleLabel: String,
  items: [{ description: String, brief: String, qty: Number, unitPrice: Number }],
  subtotal: { type: Number, default: 0 }, total: { type: Number, default: 0 },
  status: { type: String, enum: ['enviado','aprobado','rechazado'], default: 'enviado' },
  notes: String
}, { timestamps: true });
module.exports = mongoose.model('Quote', quoteSchema);
