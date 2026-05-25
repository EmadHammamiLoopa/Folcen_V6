module.exports = function(agenda){
  try {
    require('./purgeDeletedUsers')(agenda);
  } catch (e) {
    console.warn('purgeDeletedUsers job load failed', e && e.message);
  }
  try {
    require('./recomputeInterestProfiles')(agenda);
  } catch (e) {
    console.warn('recomputeInterestProfiles job load failed', e && e.message);
  }
};
