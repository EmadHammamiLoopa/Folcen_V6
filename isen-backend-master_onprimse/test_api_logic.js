
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const LegalAcceptance = require('./app/models/LegalAcceptance');
const { getAcceptancesForUser } = require('./app/utils/legalAccept');

async function testLogic() {
    try {
        await mongoose.connect(process.env.MONGODB_URL || 'mongodb://127.0.0.1:27017/isen');
        const qUserId = '6949d6df16db3452c1211539';
        const rows = await getAcceptancesForUser(qUserId, { page: 1, limit: 100 });
        
        const safe = rows.map(r => {
            let acceptedAt = r.acceptedAt || r.createdAt || r.updatedAt;
            
            if (!acceptedAt && r._id) {
                try {
                    const idStr = r._id.toString();
                    if (idStr.length === 24) {
                        acceptedAt = new Date(parseInt(idStr.substring(0, 8), 16) * 1000).toISOString();
                    }
                } catch (e) {
                    console.warn('Failed to extract timestamp from _id', e);
                }
            }

            const meta = r.meta || {};
            return { 
                _id: r._id,
                documentType: r.documentType, 
                documentVersion: r.documentVersion, 
                acceptedAt: acceptedAt || new Date().toISOString(), 
                acceptanceContext: r.acceptanceContext || 'unknown',
                meta: {
                    ip: meta.ip || 'Legacy Record (IP not captured)',
                    userAgent: meta.userAgent || 'Legacy Record (UA not captured)',
                    clientType: meta.clientType || 'mobile_app'
                }
            };
        });

        console.log('RESULTING DATA:');
        console.log(JSON.stringify(safe, null, 2));

    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}

testLogic();
