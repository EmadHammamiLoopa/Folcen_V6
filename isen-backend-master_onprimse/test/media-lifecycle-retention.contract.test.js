'use strict';

const assert =
  require('assert');

const fs =
  require('fs');

const path =
  require('path');

const backend =
  path.resolve(
    __dirname,
    '..'
  );

const read =
  rel =>
    fs.readFileSync(
      path.join(
        backend,
        rel
      ),
      'utf8'
    );

function exportedBlock(
  source,
  name
) {
  const marker =
    `exports.${name} =`;

  const start =
    source.indexOf(
      marker
    );

  assert.ok(
    start >= 0,
    `${name} missing`
  );

  const tail =
    source.slice(
      start +
      marker.length
    );

  const next =
    tail.match(
      /\nexports\.[A-Za-z0-9_]+\s*=/
    );

  return next
    ? source.slice(
        start,
        start +
          marker.length +
          next.index
      )
    : source.slice(start);
}

describe(
  'Media lifecycle retention',
  () => {

    it(
      'registers expired Post/Comment media cleanup',
      () => {
        const index =
          read(
            'app/jobs/index.js'
          );

        const job =
          read(
            'app/jobs/purgeExpiredMedia.js'
          );

        assert.match(
          index,
          /require\(['"]\.\/purgeExpiredMedia['"]\)\(agenda\)/
        );

        assert.match(
          job,
          /agenda\.define\(\s*['"]purge-expired-media['"]/
        );

        assert.match(
          job,
          /MEDIA_EXPIRY_SWEEP_INTERVAL/
        );

        assert.match(
          job,
          /media\.expiryDate/
        );

        assert.match(
          job,
          /removeManagedMedia/
        );

        assert.match(
          job,
          /\$unset[\s\S]*media\.url[\s\S]*media\.expiryDate/
        );
      }
    );

    it(
      'removes the physical media before removing the DB reference',
      () => {
        const job =
          read(
            'app/jobs/purgeExpiredMedia.js'
          );

        const physical =
          job.indexOf(
            'await removeMedia(mediaUrl)'
          );

        const database =
          job.indexOf(
            'await Model.updateOne'
          );

        assert.ok(
          physical >= 0
        );

        assert.ok(
          database > physical
        );
      }
    );

    it(
      'keeps failed cleanup references available for a later retry',
      () => {
        const job =
          read(
            'app/jobs/purgeExpiredMedia.js'
          );

        assert.match(
          job,
          /catch\s*\(error\)[\s\S]*failed\s*\+=\s*1/
        );

        assert.doesNotMatch(
          job,
          /catch\s*\(error\)[\s\S]{0,500}\$unset/
        );
      }
    );

    it(
      'suppresses expired media in direct Post and Comment responses',
      () => {
        const post =
          exportedBlock(
            read(
              'app/controllers/PostController.js'
            ),
            'showPost'
          );

        const comment =
          exportedBlock(
            read(
              'app/controllers/CommentController.js'
            ),
            'showComment'
          );

        assert.match(
          post,
          /postWithVotes\.media/
        );

        assert.match(
          post,
          /expiryDate[\s\S]*Date\.now\(\)/
        );

        assert.match(
          comment,
          /mediaIsActive/
        );

        assert.match(
          comment,
          /mediaUrl\s*=\s*null/
        );
      }
    );

    it(
      'cleans replaced Product photos only after successful save',
      () => {
        const block =
          exportedBlock(
            read(
              'app/controllers/ProductController.js'
            ),
            'updateProduct'
          );

        assert.match(
          block,
          /previousProductPhotoPaths/
        );

        assert.match(
          block,
          /replacedProductPhotoPaths/
        );

        assert.match(
          block,
          /removeManagedMedia/
        );

        assert.ok(
          block.indexOf(
            'await product.save()'
          ) <
          block.indexOf(
            'await removeManagedMedia'
          )
        );
      }
    );

    it(
      'uses store -> save -> old cleanup ordering for Service and Job replacement',
      () => {
        const targets = [
          [
            'app/controllers/ServiceController.js',
            'updateService',
            'service',
            'storeServicePhoto'
          ],
          [
            'app/controllers/jobController.js',
            'updateJob',
            'job',
            'storeJobPhoto'
          ]
        ];

        for (
          const [
            file,
            fn,
            entity,
            storeFn
          ]
          of targets
        ) {
          const block =
            exportedBlock(
              read(file),
              fn
            );

          const storePos =
            block.indexOf(
              `await ${storeFn}`
            );

          const savePos =
            block.indexOf(
              `await ${entity}.save()`
            );

          const cleanupPos =
            block.indexOf(
              'await removeManagedMedia'
            );

          assert.ok(
            storePos >= 0,
            `${fn}: store missing`
          );

          assert.ok(
            savePos > storePos,
            `${fn}: save must follow storage`
          );

          assert.ok(
            cleanupPos > savePos,
            `${fn}: old cleanup must follow successful save`
          );
        }
      }
    );

    it(
      'normalizes projected Service and Job photo strings before storage helpers',
      () => {
        const targets = [
          [
            'app/controllers/ServiceController.js',
            'updateService',
            'service'
          ],
          [
            'app/controllers/jobController.js',
            'updateJob',
            'job'
          ]
        ];

        for (
          const [
            file,
            fn,
            entity
          ]
          of targets
        ) {
          const block =
            exportedBlock(
              read(file),
              fn
            );

          assert.ok(
            block.includes(
              `typeof ${entity}.photo !== 'object'`
            ),
            `${fn}: projected photo normalization missing`
          );

          assert.ok(
            block.includes(
              `${entity}.photo = {}`
            ),
            `${fn}: photo object initialization missing`
          );
        }
      }
    );

    it(
      'uses path.extname and propagates Job photo storage failures',
      () => {
        const source =
          read(
            'app/controllers/jobController.js'
          );

        assert.doesNotMatch(
          source,
          /fileExtension\s*\(/
        );

        assert.match(
          source,
          /path\.extname\(photo\.name\s*\|\|\s*['"]['"]\)/
        );

        assert.match(
          source,
          /Job photo file extension is required/
        );

        const start =
          source.indexOf(
            'const storeJobPhoto ='
          );

        assert.ok(
          start >= 0
        );

        const helper =
          source.slice(
            start,
            source.indexOf(
              '\n};',
              start
            ) + 3
          );

        assert.match(
          helper,
          /catch\s*\(err\)[\s\S]*throw err/
        );
      }
    );

    it(
      'preserves existing destructive media cleanup',
      () => {
        const targets = [
          [
            'app/controllers/ProductController.js',
            'destroyProduct'
          ],
          [
            'app/controllers/ServiceController.js',
            'destroyService'
          ],
          [
            'app/controllers/jobController.js',
            'destroyJob'
          ]
        ];

        for (
          const [
            file,
            fn
          ]
          of targets
        ) {
          const block =
            exportedBlock(
              read(file),
              fn
            );

          assert.match(
            block,
            /removeManagedMedia/
          );
        }
      }
    );
  }
);
