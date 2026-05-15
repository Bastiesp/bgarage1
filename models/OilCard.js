const mongoose = require('mongoose');
const oilCardSchema = new mongoose.Schema({
  vehicle: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle' },
  ownerName: String,
  brand: String,
  model: String,
  year: Number,
  currentKm: Number,
  nextKm: Number,
  oilUsed: String,
  notes: String,
  date: { type: Date, default: Date.now }
}, { timestamps: true });
module.exports = mongoose.model('OilCard', oilCardSchema);
