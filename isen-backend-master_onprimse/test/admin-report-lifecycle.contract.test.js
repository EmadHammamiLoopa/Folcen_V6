'use strict';

const assert =
  require('assert');

const fs =
  require('fs');

const path =
  require('path');

const backendRoot =
  path.resolve(
    __dirname,
    '..'
  );

const repoRoot =
  path.resolve(
    backendRoot,
    '..'
  );

const dashboardRoot =
  path.join(
    repoRoot,
    'geloo-dashboard-master'
  );

const readBackend =
  rel =>
    fs.readFileSync(
      path.join(
        backendRoot,
        rel
      ),
      'utf8'
    );

const readDash =
  rel =>
    fs.readFileSync(
      path.join(
        dashboardRoot,
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
    : source.slice(
        start
      );
}

describe(
  'Admin report lifecycle and reporter wiring',
  () => {

    it(
      'dismisses User reports instead of deleting moderation evidence',
      () => {
        const source =
          readBackend(
            'app/controllers/UserController.js'
          );

        const block =
          exportedBlock(
            source,
            'clearUserReports'
          );

        assert.ok(
          block.includes(
            'dismissEntityReports'
          )
        );

        for (
          const forbidden
          of [
            'Report.deleteMany',
            'Report.deleteOne',
            'Report.findByIdAndDelete',
            'entity._id',
            'entity.id',
            'entity.name'
          ]
        ) {
          assert.ok(
            !block.includes(
              forbidden
            ),
            `clearUserReports still contains ${forbidden}`
          );
        }
      }
    );

    it(
      'keeps the User clearReports route behind live authenticated admin middleware',
      () => {
        const source =
          readBackend(
            'routes/user.js'
          );

        assert.match(
          source,
          /router\.post\(\s*['"]\/:userId\/clearReports['"][\s\S]{0,180}requireSignin[\s\S]{0,180}withAuthUser[\s\S]{0,180}isAdmin[\s\S]{0,180}clearUserReports/
        );
      }
    );

    it(
      'populates the canonical Report.reporter field in entity dashboard views',
      () => {
        const targets = [
          [
            'app/controllers/ChannelController.js',
            'showChannel'
          ],
          [
            'app/controllers/PostController.js',
            'showDashPost'
          ],
          [
            'app/controllers/CommentController.js',
            'showDashComment'
          ],
          [
            'app/controllers/ProductController.js',
            'showProductDash'
          ],
          [
            'app/controllers/ServiceController.js',
            'showServiceDash'
          ],
          [
            'app/controllers/jobController.js',
            'showJobDash'
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
              readBackend(
                file
              ),
              fn
            );

          assert.match(
            block,
            /path\s*:\s*['"]reporter['"]/,
            `${fn} does not populate reporter`
          );

          assert.doesNotMatch(
            block,
            /path\s*:\s*['"]userId['"]/,
            `${fn} still populates legacy Report.userId`
          );
        }
      }
    );

    it(
      'uses Report.reporter in entity dashboard templates',
      () => {
        const files = [
          'src/app/modules/dashboard/channel/display-channel/display-channel.component.html',
          'src/app/modules/dashboard/post/display-post/display-post.component.html',
          'src/app/modules/dashboard/comment/display-comment/display-comment.component.html',
          'src/app/modules/dashboard/product/display-product/display-product.component.html',
          'src/app/modules/dashboard/service/display-service/display-service.component.html',
          'src/app/modules/dashboard/job/display-job/display-job.component.html'
        ];

        for (
          const file
          of files
        ) {
          const source =
            readDash(
              file
            );

          assert.ok(
            !source.includes(
              'report.userId'
            ),
            `${file} still reads Report.userId`
          );
        }
      }
    );

    it(
      'does not tell moderators that dismissal deletes report history',
      () => {
        const files = [
          'src/app/modules/dashboard/channel/display-channel/display-channel.component.ts',
          'src/app/modules/dashboard/channel/display-channel/display-channel.component.html',
          'src/app/modules/dashboard/comment/display-comment/display-comment.component.ts',
          'src/app/modules/dashboard/comment/display-comment/display-comment.component.html',
          'src/app/modules/dashboard/product/display-product/display-product.component.ts',
          'src/app/modules/dashboard/product/display-product/display-product.component.html',
          'src/app/modules/dashboard/service/display-service/display-service.component.ts',
          'src/app/modules/dashboard/service/display-service/display-service.component.html',
          'src/app/modules/dashboard/job/display-job/display-job.component.ts',
          'src/app/modules/dashboard/job/display-job/display-job.component.html'
        ];

        const source =
          files
            .map(
              readDash
            )
            .join(
              '\n'
            );

        assert.doesNotMatch(
          source,
          /remove all report history/i
        );

        assert.doesNotMatch(
          source,
          />\s*Clear(?:\s+All)?\s+Reports\s*</i
        );

        assert.match(
          source,
          /Dismiss Reports|Dismiss reports/
        );

        assert.match(
          source,
          /history will be retained|Moderation history will be retained/i
        );
      }
    );

    it(
      'keeps ReportController free of moderation-evidence hard deletion',
      () => {
        const source =
          readBackend(
            'app/controllers/ReportController.js'
          );

        assert.ok(
          !source.includes(
            'Report.deleteMany'
          )
        );

        assert.ok(
          !source.includes(
            'Report.deleteOne'
          )
        );

        assert.ok(
          !source.includes(
            'Report.findByIdAndDelete'
          )
        );
      }
    );
  }
);
