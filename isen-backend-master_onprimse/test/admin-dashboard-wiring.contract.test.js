const assert =
  require('assert');

const fs =
  require('fs');

const path =
  require('path');

const BACKEND =
  path.join(
    __dirname,
    '..'
  );

const ROOT =
  path.join(
    BACKEND,
    '..'
  );

function readBackend(rel) {
  return fs.readFileSync(
    path.join(
      BACKEND,
      rel
    ),
    'utf8'
  );
}

function readDashboard(rel) {
  return fs.readFileSync(
    path.join(
      ROOT,
      'geloo-dashboard-master',
      rel
    ),
    'utf8'
  );
}

describe(
  'Admin dashboard wiring and privacy contract',
  () => {

    it(
      'loads live actors for legacy dashboard analytics aliases',
      () => {
        const src =
          readBackend(
            'routes/user.js'
          );

        assert.ok(
          src.includes(
            "router.get('/analytics', [requireSignin, withAuthUser, isAdmin]"
          )
        );

        assert.ok(
          src.includes(
            "router.get('/retention', [requireSignin, withAuthUser, isAdmin]"
          )
        );
      }
    );

    it(
      'targets announcement delivery by role',
      () => {
        const src =
          readBackend(
            'app/controllers/AdminController.js'
          );

        assert.ok(
          src.includes(
            "normalizedTarget === 'users'"
          )
        );

        assert.ok(
          src.includes(
            "normalizedTarget === 'admins'"
          )
        );

        assert.ok(
          src.includes(
            "'SUPER ADMIN'"
          )
        );

        const blockStart =
          src.indexOf(
            'exports.createAnnouncement = async'
          );

        const blockEnd =
          src.indexOf(
            'exports.getAnnouncements = async',
            blockStart
          );

        const block =
          src.slice(
            blockStart,
            blockEnd
          );

        assert.ok(
          !block.includes(
            "emitToAll('new_announcement'"
          )
        );
      }
    );

    it(
      'filters fetched announcements to the current audience',
      () => {
        const src =
          readBackend(
            'app/controllers/UserController.js'
          );

        const start =
          src.indexOf(
            'exports.getMyAnnouncements = async'
          );

        const end =
          src.indexOf(
            'exports.markAnnouncementSeen = async',
            start
          );

        const block =
          src.slice(
            start,
            end
          );

        assert.ok(
          block.includes(
            "? 'admins'"
          )
        );

        assert.ok(
          block.includes(
            ": 'users'"
          )
        );

        assert.ok(
          block.includes(
            'target:'
          )
        );
      }
    );

    it(
      'follows all backend portability pages before declaring a complete dashboard DSAR',
      () => {
        const service =
          readDashboard(
            'src/app/services/gdpr.service.ts'
          );

        const component =
          readDashboard(
            'src/app/modules/dashboard/gdpr/dsar/dsar.component.ts'
          );

        assert.ok(
          service.includes(
            'exportUserDataAll(userId'
          )
        );

        assert.ok(
          service.includes(
            'Number(page.nextPage)'
          )
        );

        assert.ok(
          service.includes(
            'dashboardAggregation'
          )
        );

        assert.ok(
          component.includes(
            'exportUserDataAll(this.userId.trim())'
          )
        );

        assert.ok(
          component.includes(
            'Incomplete DSAR Export'
          )
        );
      }
    );

    it(
      'does not put bearer tokens into DisplayUser export URLs',
      () => {
        const src =
          readDashboard(
            'src/app/modules/dashboard/user/display-user/display-user.component.ts'
          );

        assert.ok(
          src.includes(
            'sendGetBlobRequest'
          )
        );

        assert.ok(
          src.includes(
            'exportUserDataAll(id)'
          )
        );

        assert.ok(
          !src.includes(
            '?format=${format}&token=${token}'
          )
        );

        assert.ok(
          !src.includes(
            'this.http.get('
          )
        );
      }
    );

    it(
      'uses canonical analytics routes and hides announcement deletion from ordinary admins',
      () => {
        const ts =
          readDashboard(
            'src/app/modules/dashboard/user/analytics/analytics.component.ts'
          );

        const html =
          readDashboard(
            'src/app/modules/dashboard/user/analytics/analytics.component.html'
          );

        assert.ok(
          ts.includes(
            "'admin/analytics'"
          )
        );

        assert.ok(
          ts.includes(
            "'admin/analytics/users/retention'"
          )
        );

        assert.ok(
          ts.includes(
            "user.role === 'SUPER ADMIN'"
          )
        );

        assert.ok(
          html.includes(
            '*ngIf="canDeleteAnnouncements"'
          )
        );
      }
    );

    it(
      'keeps channel and subscription export bearer tokens out of URLs',
      () => {
        const channel =
          readDashboard(
            'src/app/modules/dashboard/channel/list/list.component.ts'
          );

        const subscription =
          readDashboard(
            'src/app/modules/dashboard/subscription/list/list.component.ts'
          );

        assert.ok(
          channel.includes(
            "'admin/channels/export'"
          )
        );

        assert.ok(
          channel.includes(
            'sendGetBlobRequest'
          )
        );

        assert.ok(
          !channel.includes(
            'token=${token}'
          )
        );

        assert.ok(
          subscription.includes(
            "'admin/subscriptions/export'"
          )
        );

        assert.ok(
          subscription.includes(
            'sendGetBlobRequest'
          )
        );

        assert.ok(
          !subscription.includes(
            'token=${token}'
          )
        );
      }
    );


    it(
      'persists expired temporary-ban cleanup without calling save on a lean auth user',
      () => {
        const src =
          readBackend(
            'app/middlewares/auth.js'
          );

        assert.ok(
          src.includes(
            'loadAuthUser(req, userId)'
          )
        );

        assert.ok(
          src.includes(
            '.lean()'
          )
        );

        assert.ok(
          src.includes(
            "Failed to refresh account ban status"
          )
        );

        assert.ok(
          src.includes(
            'await User.updateOne('
          )
        );

        const expiredStart =
          src.indexOf(
            '// Ban expired.'
          );

        const deletedStart =
          src.indexOf(
            '// Check if user is deleted',
            expiredStart
          );

        const expiredBlock =
          src.slice(
            expiredStart,
            deletedStart
          );

        assert.ok(
          !expiredBlock.includes(
            'user.save()'
          )
        );

        assert.ok(
          expiredBlock.includes(
            'user.banned = false'
          )
        );
      }
    );

    it(
      'does not log authorization headers or cookies when export authentication fails',
      () => {
        const src =
          readBackend(
            'app/middlewares/auth.js'
          );

        assert.ok(
          src.includes(
            'Never log request headers/cookies here'
          )
        );

        assert.ok(
          !src.includes(
            'Export auth failure. Headers:'
          )
        );

        assert.ok(
          !src.includes(
            "logger.info('Cookies:', req.cookies)"
          )
        );

        assert.ok(
          src.includes(
            "path: req.path"
          )
        );
      }
    );


    it(
      'treats a terminal later DSAR page as a complete aggregated export',
      () => {
        const src =
          readDashboard(
            'src/app/services/gdpr.service.ts'
          );

        assert.ok(
          src.includes(
            'lastPage.hasMore === false'
          )
        );

        assert.ok(
          src.includes(
            'lastPage.nextPage === null'
          )
        );

        assert.ok(
          src.includes(
            'lastPage.nextPage === undefined'
          )
        );

        assert.ok(
          src.includes(
            'Backend page.complete intentionally means:'
          )
        );

        const mergeStart =
          src.indexOf(
            'private mergePortabilityPages'
          );

        const mergeBlock =
          src.slice(
            mergeStart
          );

        assert.ok(
          !mergeBlock.includes(
            'const complete =\\n      lastPage.complete === true'
          )
        );
      }
    );


    it(
      'requires live database-backed admin state on dashboard routes across all content modules',
      () => {
        const routeFiles = [
          'routes/channel.js',
          'routes/post.js',
          'routes/comment.js',
          'routes/product.js',
          'routes/service.js',
          'routes/job.js',
          'routes/subscription.js'
        ];

        let guardedRoutes = 0;

        for (const routeFile of routeFiles) {
          const src =
            readBackend(
              routeFile
            );

          /*
           * Match middleware arrays rather than physical source lines.
           * Some routes (for example comment post-comments) declare their
           * middleware chain across multiple lines.
           */
          const middlewareArrays =
            src.match(
              /\[[^\]]*\]/gs
            ) || [];

          for (const chain of middlewareArrays) {
            if (
              chain.includes(
                'requireSignin'
              ) &&
              chain.includes(
                'isAdmin'
              )
            ) {
              assert.ok(
                chain.includes(
                  'withAuthUser'
                ),
                `${routeFile} has JWT-only admin middleware chain: ${chain}`
              );

              guardedRoutes += 1;
            }
          }
        }

        assert.strictEqual(
          guardedRoutes,
          46
        );
      }
    );

    it(
      'uses live database-backed roles for owner-middleware admin bypasses',
      () => {
        const helpers =
          readBackend(
            'app/helpers.js'
          );

        assert.ok(
          helpers.includes(
            'req.authUser ||'
          )
        );

        assert.ok(
          helpers.includes(
            'actor.enabled === false'
          )
        );

        assert.ok(
          helpers.includes(
            'actor.isDeleted === true'
          )
        );

        const ownerRoutes = [
          ['routes/channel.js', 'channelOwner'],
          ['routes/post.js', 'postOwner'],
          ['routes/comment.js', 'commentOwner'],
          ['routes/product.js', 'productOwner'],
          ['routes/service.js', 'serviceOwner'],
          ['routes/job.js', 'jobOwner']
        ];

        for (
          const [
            routeFile,
            ownerMiddleware
          ]
          of ownerRoutes
        ) {
          const src =
            readBackend(
              routeFile
            );

          const chains =
            src.match(
              /\[[^\]]*\]/gs
            ) || [];

          const relevant =
            chains.filter(
              chain =>
                chain.includes(
                  ownerMiddleware
                )
            );

          assert.ok(
            relevant.length > 0,
            `${routeFile}: no ${ownerMiddleware} chains found`
          );

          for (const chain of relevant) {
            assert.ok(
              chain.includes(
                'withAuthUser'
              ),
              `${routeFile}: owner chain lacks live actor: ${chain}`
            );
          }
        }
      }
    );

    it(
      'uses the live actor for legal administrator bypass decisions',
      () => {
        const src =
          readBackend(
            'app/middlewares/legal.js'
          );

        assert.ok(
          src.includes(
            'req.authUser ||'
          )
        );

        assert.ok(
          src.includes(
            'actor.enabled !== false'
          )
        );

        assert.ok(
          src.includes(
            'actor.isDeleted !== true'
          )
        );

        assert.ok(
          !src.includes(
            "if (req.auth && (req.auth.role === 'ADMIN'"
          )
        );
      }
    );

    it(
      'registers the missing dashboard channel edit endpoint',
      () => {
        const route =
          readBackend(
            'routes/channel.js'
          );

        assert.ok(
          route.includes(
            'showChannelEditDash'
          )
        );

        assert.ok(
          route.includes(
            "router.get('/dash/edit/:channelId', [requireSignin, withAuthUser, isAdmin], showChannelEditDash);"
          )
        );

        const form =
          readDashboard(
            'src/app/modules/dashboard/channel/channel-form/channel-form.component.html'
          );

        assert.ok(
          form.includes(
            'retrieveURL="channel/dash/edit/:id"'
          )
        );
      }
    );

    it(
      'clears entity reports through the current schema and finite retention lifecycle',
      () => {
        const utility =
          readBackend(
            'app/utils/reportModeration.js'
          );

        assert.ok(
          utility.includes(
            'entityModel'
          )
        );

        assert.ok(
          utility.includes(
            "'dismissed'"
          )
        );

        assert.ok(
          utility.includes(
            'resolvedAt'
          )
        );

        assert.ok(
          utility.includes(
            'retentionDate'
          )
        );

        assert.ok(
          !utility.includes(
            'deleteMany('
          )
        );

        const targets = [
          [
            'app/controllers/ChannelController.js',
            'clearChannelReports',
            'Channel'
          ],
          [
            'app/controllers/ProductController.js',
            'clearProductReports',
            'Product'
          ],
          [
            'app/controllers/ServiceController.js',
            'clearServiceReports',
            'Service'
          ],
          [
            'app/controllers/jobController.js',
            'clearJobReports',
            'Job'
          ],
          [
            'app/controllers/CommentController.js',
            'clearCommentReports',
            'Comment'
          ]
        ];

        const extractExportedFunction =
          (
            src,
            functionName
          ) => {
            const marker =
              `exports.${functionName} =`;

            const start =
              src.indexOf(
                marker
              );

            assert.ok(
              start >= 0,
              `${functionName} not found`
            );

            const tail =
              src.slice(
                start +
                marker.length
              );

            const next =
              tail.search(
                /\nexports\.[A-Za-z0-9_]+\s*=/
              );

            return next >= 0
              ? src.slice(
                  start,
                  start +
                    marker.length +
                    next
                )
              : src.slice(
                  start
                );
          };

        for (
          const [
            file,
            functionName,
            entityModel
          ]
          of targets
        ) {
          const src =
            readBackend(
              file
            );

          const functionBlock =
            extractExportedFunction(
              src,
              functionName
            );

          assert.ok(
            functionBlock.includes(
              'dismissEntityReports'
            ),
            `${functionName} does not use retention-safe dismissal`
          );

          assert.ok(
            functionBlock.includes(
              `'${entityModel}'`
            ),
            `${functionName} does not use entityModel ${entityModel}`
          );

          assert.ok(
            functionBlock.includes(
              'reports: []'
            ),
            `${functionName} does not clear active report references`
          );

          assert.ok(
            !functionBlock.includes(
              '"entity._id"'
            ),
            `${functionName} still uses legacy entity._id lookup`
          );

          assert.ok(
            !functionBlock.includes(
              "'entity.id'"
            ),
            `${functionName} still uses legacy entity.id lookup`
          );

          assert.ok(
            !functionBlock.includes(
              'entity.name'
            ),
            `${functionName} still uses legacy entity.name lookup`
          );

          assert.ok(
            !functionBlock.includes(
              'Report.deleteMany'
            ),
            `${functionName} still hard-deletes report evidence`
          );
        }
      }
    );

    it(
      'resolves destructive content reports without hard-deleting moderation evidence',
      () => {
        const reportUtility =
          readBackend(
            'app/utils/reportModeration.js'
          );

        assert.ok(
          reportUtility.includes(
            'async function resolveEntityReports'
          )
        );

        assert.ok(
          reportUtility.includes(
            "resolutionAction:"
          )
        );

        assert.ok(
          reportUtility.includes(
            "'Content Removed'"
          )
        );

        assert.ok(
          reportUtility.includes(
            'retentionDate'
          )
        );

        const targets = [
          [
            'app/controllers/ChannelController.js',
            'destroyChannel',
            'Channel'
          ],
          [
            'app/controllers/PostController.js',
            'destroyPost',
            'Post'
          ],
          [
            'app/controllers/CommentController.js',
            'destroyComment',
            'Comment'
          ],
          [
            'app/controllers/ProductController.js',
            'destroyProduct',
            'Product'
          ],
          [
            'app/controllers/ServiceController.js',
            'destroyService',
            'Service'
          ],
          [
            'app/controllers/jobController.js',
            'destroyJob',
            'Job'
          ]
        ];

        const extractExport =
          (
            src,
            functionName
          ) => {
            const marker =
              `exports.${functionName} =`;

            const start =
              src.indexOf(
                marker
              );

            assert.ok(
              start >= 0,
              `${functionName} not found`
            );

            const tail =
              src.slice(
                start +
                marker.length
              );

            const next =
              tail.search(
                /\nexports\.[A-Za-z0-9_]+\s*=/
              );

            return next >= 0
              ? src.slice(
                  start,
                  start +
                    marker.length +
                    next
                )
              : src.slice(
                  start
                );
          };

        for (
          const [
            file,
            fn,
            model
          ]
          of targets
        ) {
          const block =
            extractExport(
              readBackend(
                file
              ),
              fn
            );

          assert.ok(
            block.includes(
              'resolveEntityReports'
            ),
            `${fn} does not resolve report lifecycle`
          );

          assert.ok(
            block.includes(
              `'${model}'`
            ),
            `${fn} does not resolve ${model} reports`
          );

          assert.ok(
            !block.includes(
              'Report.deleteMany'
            ),
            `${fn} still hard-deletes moderation evidence`
          );

          assert.ok(
            !block.includes(
              'entity.id'
            ),
            `${fn} still uses legacy entity.id report schema`
          );

          assert.ok(
            !block.includes(
              'entity.name'
            ),
            `${fn} still uses legacy entity.name report schema`
          );
        }
      }
    );

    it(
      'removes managed content media during destructive deletion',
      () => {
        const utility =
          readBackend(
            'app/utils/contentMediaLifecycle.js'
          );

        assert.ok(
          utility.includes(
            'mediaStore.removeStored'
          )
        );

        assert.ok(
          utility.includes(
            "error.code ==="
          )
        );

        assert.ok(
          utility.includes(
            "'ENOENT'"
          )
        );

        assert.ok(
          utility.includes(
            "'/channels/channel-default.png'"
          )
        );

        const files = [
          'app/controllers/ChannelController.js',
          'app/controllers/PostController.js',
          'app/controllers/CommentController.js',
          'app/controllers/ProductController.js',
          'app/controllers/ServiceController.js',
          'app/controllers/jobController.js'
        ];

        for (const file of files) {
          const src =
            readBackend(
              file
            );

          assert.ok(
            src.includes(
              'removeManagedMedia'
            ),
            `${file} does not use managed media deletion`
          );
        }

        const product =
          readBackend(
            'app/controllers/ProductController.js'
          );

        assert.ok(
          product.includes(
            'return exports.destroyProduct('
          ),
          'legacy Product owner delete bypasses complete destruction lifecycle'
        );
      }
    );

    it(
      'awaits channel child-post destruction before returning channel deletion success',
      () => {
        const channel =
          readBackend(
            'app/controllers/ChannelController.js'
          );

        assert.ok(
          channel.includes(
            'await Promise.all('
          )
        );

        assert.ok(
          channel.includes(
            'suppressResponse:'
          )
        );

        assert.ok(
          channel.includes(
            'true'
          )
        );

        assert.ok(
          !channel.includes(
            'posts.forEach(post => destroyPost'
          )
        );

        const post =
          readBackend(
            'app/controllers/PostController.js'
          );

        assert.ok(
          post.includes(
            'options.suppressResponse === true'
          )
        );

        assert.ok(
          post.includes(
            'throw err'
          )
        );
      }
    );


  }
);
