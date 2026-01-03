const { expect } = require('chai');
const { parseAgeRange, buildBaseFilter } = require('../app/controllers/UserController');

describe('UserController filter helpers', function() {
  it('parseAgeRange should convert ages to birthDate bounds', function() {
    const { minBirth, maxBirth } = parseAgeRange('18', '25');
    expect(minBirth).to.be.instanceof(Date);
    expect(maxBirth).to.be.instanceof(Date);
    // minBirth should be earlier (older) than maxBirth
    expect(minBirth.getTime()).to.be.at.least(maxBirth.getTime());
  });

  it('buildBaseFilter should respect interests=1 and gender', function() {
    const fakeReq = { query: { interests: '1', gender: 'female' }, authUser: { interests: ['music','sports'] }, auth: { _id: '000000000000000000000000' }, authUser: { blockedUsers: [], profession: '', education: '' } };
    const filter = buildBaseFilter(fakeReq);
    expect(filter).to.have.property('interests');
    expect(filter).to.have.property('gender');
    expect(filter.gender).to.equal('female');
  });
});
