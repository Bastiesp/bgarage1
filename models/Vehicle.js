const mongoose = require('mongoose');
const vehicleSchema = new mongoose.Schema({
  ownerName: { type: String, required: true }, ownerPhone: String, ownerEmail: String,
  plate: { type: String, trim: true, uppercase: true }, brand: String, model: String, year: Number,
  currentKm: Number, notes: String,
}, { timestamps: true });
module.exports = mongoose.model('Vehicle', vehicleSchema);
