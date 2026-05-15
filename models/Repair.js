const mongoose = require('mongoose');
const repairSchema = new mongoose.Schema({
  vehicle: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle', required: true },
  title: { type: String, required: true },
  status: { type: String, enum: ['presupuestado','en_reparacion','entregado'], default: 'presupuestado' },
  week: String,
  diagnosis: String,
  workDone: String,
  partsChanged: [{ name: String, cost: Number, sellPrice: Number }],
  codes: [String],
  extraProblems: String,
  laborPrice: { type: Number, default: 0 },
  externalCosts: { type: Number, default: 0 },
  totalCharged: { type: Number, default: 0 },
  totalCost: { type: Number, default: 0 },
  profit: { type: Number, default: 0 },
  photos: [{ url: String, publicId: String, caption: String }],
  deliveredAt: Date,
  statusChangedAt: Date
}, { timestamps: true });
repairSchema.pre('save', function(next){
  const partsCost = (this.partsChanged||[]).reduce((s,p)=>s+Number(p.cost||0),0);
  this.totalCost = partsCost + Number(this.externalCosts||0);
  this.profit = Number(this.totalCharged||0) - this.totalCost;
  if (!this.statusChangedAt) this.statusChangedAt = new Date();
  if (this.status === 'entregado' && !this.deliveredAt) this.deliveredAt = new Date();
  next();
});
module.exports = mongoose.model('Repair', repairSchema);
