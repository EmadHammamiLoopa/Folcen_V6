module.exports = function(agenda){
  try {
    require('./purgeDeletedUsers')(agenda);
  } catch (e) {
    console.warn('Jobs load failed', e && e.message);
  }
};
