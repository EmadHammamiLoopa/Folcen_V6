try{
  const r = require('../routes/gdpr');
  console.log('gdpr route required OK, type:', typeof r);
}catch(e){
  console.error('require failed', e && e.stack);
  process.exit(2);
}
