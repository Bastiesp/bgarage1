'use strict';
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const auth = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 10000;
if(!process.env.JWT_SECRET) { console.error('JWT_SECRET no definido'); process.exit(1); }
if(!process.env.MONGODB_URI) { console.error('MONGODB_URI no definido'); process.exit(1); }

app.use(cors());
app.use(express.json({limit:'10mb'}));
app.use(express.urlencoded({extended:true, limit:'10mb'}));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api/auth', require('./routes/auth'));
app.use('/api', auth, require('./routes/api'));
app.get('/health', (req,res)=>res.json({ok:true,name:'BGarage',version:'1.0.0-render-crm',cloudinaryEnabled:!!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET)}));
app.get('*', (req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));

mongoose.connect(process.env.MONGODB_URI).then(()=>{
  app.listen(PORT, '0.0.0.0', ()=> console.log(`BGarage listo en puerto ${PORT}`));
}).catch(err=>{ console.error('Error MongoDB:', err.message); process.exit(1); });
