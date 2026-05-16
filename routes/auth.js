const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const auth = require('../middleware/auth');
const router = express.Router();

function sign(user){ return jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' }); }

router.post('/register', async (req,res)=>{
  try{
    const { name, email, password, registrationCode } = req.body;
    const totalUsers = await User.countDocuments();
    const registrationOpen = String(process.env.REGISTRATION_OPEN || 'false').toLowerCase() === 'true';
    const configuredCode = String(process.env.REGISTRATION_CODE || '').trim();
    const codeOk = configuredCode && String(registrationCode || '').trim() === configuredCode;

    // Seguridad: si ya existe al menos un usuario, el registro queda cerrado por defecto.
    // Para habilitar nuevos usuarios: REGISTRATION_OPEN=true o definir REGISTRATION_CODE y entregarlo solo a quien corresponda.
    if(totalUsers > 0 && !registrationOpen && !codeOk){
      return res.status(403).json({error:'Registro cerrado. Solo el administrador puede habilitar nuevos usuarios.'});
    }

    if(!name || !email || !password) return res.status(400).json({error:'Nombre, email y contraseña requeridos'});
    if(password.length < 8) return res.status(400).json({error:'La contraseña debe tener mínimo 8 caracteres'});
    const exists = await User.findOne({ email: String(email).toLowerCase() });
    if(exists) return res.status(409).json({error:'Email ya registrado'});
    const hash = await bcrypt.hash(password, 12);
    const role = String(email).toLowerCase() === String(process.env.ADMIN_EMAIL||'').toLowerCase() ? 'admin' : 'user';
    const user = await User.create({ name, email, password: hash, role });
    res.json({ token: sign(user), user: { id:user._id, name:user.name, email:user.email, role:user.role } });
  }catch(e){ res.status(500).json({error:'Error registrando usuario'}); }
});

router.post('/login', async (req,res)=>{
  try{
    const { email, password } = req.body;
    const user = await User.findOne({ email: String(email||'').toLowerCase() });
    if(!user) return res.status(401).json({error:'Credenciales incorrectas'});
    const ok = await bcrypt.compare(password||'', user.password);
    if(!ok) return res.status(401).json({error:'Credenciales incorrectas'});
    res.json({ token: sign(user), user: { id:user._id, name:user.name, email:user.email, role:user.role } });
  }catch(e){ res.status(500).json({error:'Error iniciando sesión'}); }
});

router.get('/me', auth, (req,res)=> res.json({user:req.user}));
module.exports = router;
