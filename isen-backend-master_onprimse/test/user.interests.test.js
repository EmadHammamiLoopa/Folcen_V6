const chai = require('chai');
const expect = chai.expect;
const User = require('../app/models/User');

describe('User interests decoding (privacy-safe)', function() {
  it('decodes single base64-encoded interests string into array', function() {
    const raw = 'music,sports,reading';
    const b64 = Buffer.from(raw, 'utf-8').toString('base64');
    const u = new User({ firstName: 'T', lastName: 'U', interests: b64 });
    const info = u.publicInfo();
    expect(info).to.have.property('interests').that.is.an('array');
    expect(info.interests).to.deep.equal(['music', 'sports', 'reading']);
  });

  it('keeps already-array interests unchanged', function() {
    const arr = ['one','two','three'];
    const u = new User({ firstName: 'A', lastName: 'B', interests: arr });
    const info = u.publicInfo();
    expect(info.interests).to.deep.equal(arr);
  });

  it('falls back safely for malformed base64', function() {
    const bad = '!!!not_base64###';
    const u = new User({ firstName: 'X', lastName: 'Y', interests: bad });
    const info = u.publicInfo();
    expect(info.interests).to.be.an('array');
    expect(info.interests.length).to.be.at.least(1);
    expect(info.interests[0]).to.equal(bad.trim());
  });
});
