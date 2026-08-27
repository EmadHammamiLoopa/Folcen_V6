const Response = require('./Response');
const { recordAudit } = require('../utils/audit');
const tokenBlacklist = require('../utils/tokenBlacklist');
const User = require('../models/User');
const Post = require('../models/Post');
const Comment = require('../models/Comment');
const Message = require('../models/Message');
const { connectedUsers, socketUserMap } = require('../utils/socketManager');
const { purgeUser, userSocketIds } = require('../helpers');
const { buildPaginationManifest } = require('../utils/dsarSupport');
const {
  buildErasureRetentionPlan,
  minimizeRetainedErasureEvidence
} = require('../utils/erasureRetention');

// Allowed fields for rectification (minimization principle)
const ALLOWED_RECTIFY_FIELDS = [
  'firstName', 'lastName', 'email', 'birthDate', 'gender',
  'city', 'country', 'address', 'aboutMe', 'school',
  'education', 'profession', 'interests', 'languages'
];

function canActOnUser(actor, targetId) {
  if (!actor || !targetId) return false;

  if (
    actor.role === 'ADMIN' ||
    actor.role === 'SUPER ADMIN'
  ) {
    return true;
  }

  return String(actor._id) === String(targetId);
}

// Helper: sanitize user public info using existing publicInfo method if available
function sanitizeUserForDsar(user){
  if (!user) return null;
  try { return user.publicInfo ? user.publicInfo(true) : { id: user._id }; } catch (e) { return { id: user._id }; }
}

exports.access = async (req, res) => {
  try {
    const actor = req.authUser;
    let target = actor;

    // Explicit cross-user target is permitted only for an admin.
    // A normal user may target only their own id.
    if (req.query && req.query.userId) {
      if (!canActOnUser(actor, req.query.userId)) {
        return Response.sendError(res, 403, 'Access forbidden');
      }

      target = await User.findById(req.query.userId);

      if (!target) {
        return Response.sendResponse(
          res,
          {},
          'Request processed'
        );
      }
    }

    const page = Math.max(
      1,
      parseInt(
        (req.query && req.query.page) || '1',
        10
      ) || 1
    );

    const limit = Math.min(
      100,
      Math.max(
        1,
        parseInt(
          (req.query && req.query.limit) || '50',
          10
        ) || 50
      )
    );

    const skip =
      (page - 1) *
      limit;

    const userId =
      target._id;


    // Article 15 is intentionally broader than the public-profile
    // serializer. Do not include credential secrets such as password
    // hashes, salts, 2FA secrets, reset tokens or bearer tokens.
    const account = {
      ...sanitizeUserForDsar(target),

      phone:
        target.phone || null,

      firebaseUid:
        target.firebaseUid || null,

      googleId:
        target.googleId || null,

      acceptedTerms:
        target.acceptedTerms === true,

      acceptedTermsAt:
        target.acceptedTermsAt || null,

      isDeleted:
        target.isDeleted === true,

      deletedAt:
        target.deletedAt || null,

      purgeAt:
        target.purgeAt || null,

      updatedAt:
        target.updatedAt || null
    };


    // Explicit model inventory for Article 15.
    const Follow =
      require('../models/Follow');

    const CallEvent =
      require('../models/CallEvent');

    const MessageEvent =
      require('../models/MessageEvent');

    const Notification =
      require('../models/Notification');

    const UserConsent =
      require('../models/UserConsent');

    const UserInterestProfile =
      require('../models/UserInterestProfile');

    const AnalyticsEvent =
      require('../models/AnalyticsEvent');

    const UserActivityDaily =
      require('../models/UserActivityDaily');

    const AuthEvent =
      require('../models/AuthEvent');

    const Activity =
      require('../models/Activity');

    const Report =
      require('../models/Report');

    const Product =
      require('../models/Product');

    const Job =
      require('../models/Job');

    const Service =
      require('../models/Service');

    const Channel =
      require('../models/Channel');

    const Request =
      require('../models/Request');

    const PushToken =
      require('../models/PushToken');

    const Subscription =
      require('../models/Subscription');

    const Peer =
      require('../models/Peer');

    const AuditLog =
      require('../models/AuditLog');

    const LegalAcceptance =
      require('../models/LegalAcceptance');


    // Copy of user-related personal data.
    const [
      posts,
      comments,
      messages,
      followers,
      following,
      callEvents,
      messageEvents,
      notifications,
      analyticsEvents,
      dailyActivity,
      authEvents,
      activities,
      reports,
      reportsAboutUser,
      products,
      jobs,
      services,
      channels,
      requests,
      pushTokens,
      subscriptions,
      auditLogsRaw,
      consentRecord,
      interestProfile,
      peerIdentifier
    ] = await Promise.all([
      Post.find({
        user: userId
      })
        .sort({ _id: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),

      Comment.find({
        user: userId
      })
        .sort({ _id: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),

      Message.find({
        $or: [
          { from: userId },
          { to: userId }
        ]
      })
        .sort({ _id: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),

      Follow.find({
        followed: userId
      })
        .sort({ _id: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),

      Follow.find({
        follower: userId
      })
        .sort({ _id: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),

      CallEvent.find({
        $or: [
          { initiatedBy: userId },
          { participants: userId }
        ]
      })
        .sort({ _id: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),

      MessageEvent.find({
        $or: [
          { from: userId },
          { to: userId }
        ]
      })
        .sort({ _id: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),

      Notification.find({
        $or: [
          { recipient: userId },
          { sender: userId }
        ]
      })
        .select(
          'recipient sender type title body data read createdAt'
        )
        .sort({ _id: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),

      AnalyticsEvent.find({
        userId
      })
        .select(
          'eventType targetId targetType category channelId tags createdAt'
        )
        .sort({ _id: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),

      UserActivityDaily.find({
        userId
      })
        .sort({ _id: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),

      AuthEvent.find({
        user: userId
      })
        .select(
          'type ipHash reasonCode meta createdAt'
        )
        .sort({ _id: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),

      Activity.find({
        actor: userId
      })
        .sort({ _id: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),

      Report.find({
        reporter: userId
      })
        .select(
          'message entity entityModel photoUrl reasonCode reportType severity consentGiven isAnonymous evidence status resolutionAction createdAt updatedAt'
        )
        .sort({ _id: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),

      // Reports about the user's account are returned without reporter
      // identity, free-text report content, evidence or moderator notes.
      Report.find({
        entity: userId,
        entityModel: 'User'
      })
        .select(
          'entity entityModel reasonCode reportType severity status resolutionAction createdAt updatedAt'
        )
        .sort({ _id: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),

      Product.find({
        user: userId
      })
        .sort({ _id: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),

      Job.find({
        user: userId
      })
        .sort({ _id: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),

      Service.find({
        user: userId
      })
        .sort({ _id: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),

      Channel.find({
        user: userId
      })
        .sort({ _id: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),

      Request.find({
        $or: [
          { from: userId },
          { to: userId }
        ]
      })
        .sort({ _id: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),

      PushToken.find({
        userId
      })
        .select(
          'token platform deviceId lastSeenAt createdAt updatedAt'
        )
        .sort({ _id: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),

      Subscription.find({
        userId
      })
        .sort({ _id: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),

      AuditLog.find({
        $or: [
          { actorId: userId },
          { targetUserId: userId }
        ]
      })
        .select(
          'timestamp actorId actorRole action targetUserId meta ip userAgent'
        )
        .sort({ _id: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),

      UserConsent.findOne({
        userId
      })
        .select(
          '-_id analytics_optin personalization createdAt updatedAt history'
        )
        .lean(),

      UserInterestProfile.findOne({
        userId
      })
        .select(
          '-_id topCategories tagCounts lastComputedAt expiresAt'
        )
        .lean(),

      Peer.findOne({
        userId:
          String(userId)
      })
        .select(
          '-_id peerId lastUpdated'
        )
        .lean()
    ]);


    // Protect other people's identifiers in audit records while still
    // giving the subject the audit data that relates to them.
    const auditLogs =
      auditLogsRaw.map(
        log => {
          const actorIsSubject =
            String(log.actorId || '') ===
            String(userId);

          const targetIsSubject =
            String(log.targetUserId || '') ===
            String(userId);

          return {
            timestamp:
              log.timestamp,

            actorId:
              actorIsSubject
                ? log.actorId
                : null,

            actorRole:
              log.actorRole || null,

            action:
              log.action,

            targetUserId:
              targetIsSubject
                ? log.targetUserId
                : null,

            meta:
              log.meta || {},

            ip:
              actorIsSubject
                ? log.ip || null
                : null,

            userAgent:
              actorIsSubject
                ? log.userAgent || null
                : null
          };
        }
      );


    // Legal acceptance history remains part of Article 15 access.
    const {
      getAcceptancesForUser
    } = require(
      '../utils/legalAccept'
    );

    const acceptanceRows =
      await getAcceptancesForUser(
        userId,
        {
          page,
          limit
        }
      );

    const legalAcceptances =
      acceptanceRows.map(
        acceptance => {
          let rawDate =
            acceptance.acceptedAt ||
            acceptance.createdAt ||
            acceptance.updatedAt;

          if (
            !rawDate &&
            acceptance._id
          ) {
            try {
              const idStr =
                acceptance._id.toString();

              if (
                idStr.length === 24
              ) {
                rawDate =
                  new Date(
                    parseInt(
                      idStr.substring(
                        0,
                        8
                      ),
                      16
                    ) *
                    1000
                  );
              }
            } catch (_) {}
          }

          const acceptedAt =
            (
              rawDate instanceof Date
                ? rawDate
                : new Date(
                    rawDate ||
                    Date.now()
                  )
            ).toISOString();

          const meta =
            acceptance.meta || {};

          return {
            _id:
              acceptance._id,

            documentType:
              acceptance.documentType,

            documentVersion:
              acceptance.documentVersion,

            acceptedAt,

            acceptanceContext:
              acceptance.acceptanceContext ||
              'unknown',

            meta: {
              ip:
                meta.ip ||
                'Legacy Record',

              userAgent:
                meta.userAgent ||
                'Legacy Record',

              clientType:
                meta.clientType ||
                'mobile_app'
            }
          };
        }
      );

    // Preserve the established user.legalAcceptances access shape.
    account.legalAcceptances =
      legalAcceptances;


    const [
      postsTotal,
      commentsTotal,
      messagesTotal,
      followersTotal,
      followingTotal,
      callEventsTotal,
      messageEventsTotal,
      notificationsTotal,
      analyticsEventsTotal,
      dailyActivityTotal,
      authEventsTotal,
      activitiesTotal,
      reportsTotal,
      reportsAboutUserTotal,
      productsTotal,
      jobsTotal,
      servicesTotal,
      channelsTotal,
      requestsTotal,
      pushTokensTotal,
      subscriptionsTotal,
      auditLogsTotal,
      legalAcceptancesTotal
    ] = await Promise.all([
      Post.countDocuments({
        user: userId
      }),

      Comment.countDocuments({
        user: userId
      }),

      Message.countDocuments({
        $or: [
          { from: userId },
          { to: userId }
        ]
      }),

      Follow.countDocuments({
        followed: userId
      }),

      Follow.countDocuments({
        follower: userId
      }),

      CallEvent.countDocuments({
        $or: [
          { initiatedBy: userId },
          { participants: userId }
        ]
      }),

      MessageEvent.countDocuments({
        $or: [
          { from: userId },
          { to: userId }
        ]
      }),

      Notification.countDocuments({
        $or: [
          { recipient: userId },
          { sender: userId }
        ]
      }),

      AnalyticsEvent.countDocuments({
        userId
      }),

      UserActivityDaily.countDocuments({
        userId
      }),

      AuthEvent.countDocuments({
        user: userId
      }),

      Activity.countDocuments({
        actor: userId
      }),

      Report.countDocuments({
        reporter: userId
      }),

      Report.countDocuments({
        entity: userId,
        entityModel: 'User'
      }),

      Product.countDocuments({
        user: userId
      }),

      Job.countDocuments({
        user: userId
      }),

      Service.countDocuments({
        user: userId
      }),

      Channel.countDocuments({
        user: userId
      }),

      Request.countDocuments({
        $or: [
          { from: userId },
          { to: userId }
        ]
      }),

      PushToken.countDocuments({
        userId
      }),

      Subscription.countDocuments({
        userId
      }),

      AuditLog.countDocuments({
        $or: [
          { actorId: userId },
          { targetUserId: userId }
        ]
      }),

      LegalAcceptance.countDocuments({
        userId
      })
    ]);


    const totals = {
      posts:
        postsTotal,

      comments:
        commentsTotal,

      messages:
        messagesTotal,

      followers:
        followersTotal,

      following:
        followingTotal,

      callEvents:
        callEventsTotal,

      messageEvents:
        messageEventsTotal,

      notifications:
        notificationsTotal,

      analyticsEvents:
        analyticsEventsTotal,

      dailyActivity:
        dailyActivityTotal,

      authEvents:
        authEventsTotal,

      activities:
        activitiesTotal,

      reports:
        reportsTotal,

      reportsAboutUser:
        reportsAboutUserTotal,

      products:
        productsTotal,

      jobs:
        jobsTotal,

      services:
        servicesTotal,

      channels:
        channelsTotal,

      requests:
        requestsTotal,

      pushTokens:
        pushTokensTotal,

      subscriptions:
        subscriptionsTotal,

      auditLogs:
        auditLogsTotal,

      legalAcceptances:
        legalAcceptancesTotal
    };


    const paginationManifest =
      buildPaginationManifest(
        totals,
        {
          posts,
          comments,
          messages,
          followers,
          following,
          callEvents,
          messageEvents,
          notifications,
          analyticsEvents,
          dailyActivity,
          authEvents,
          activities,
          reports,
          reportsAboutUser,
          products,
          jobs,
          services,
          channels,
          requests,
          pushTokens,
          subscriptions,
          auditLogs,
          legalAcceptances
        },
        page,
        limit
      );


    // Article 15 processing information supplied with the data copy.
    //
    // Processor identities, hosting regions and international-transfer
    // safeguards are verified separately during the production-config /
    // final legal-text gate before release.
    const processingInformation = {
      purposes: [
        'Account creation and service delivery',
        'Social, content and communication functionality',
        'Security, fraud and abuse prevention',
        'Moderation and user-safety workflows',
        'Legal compliance and accountability',
        'Analytics when the user has opted in',
        'Personalization when the user has opted in'
      ],

      categories: [
        'Account and profile data',
        'User-generated content',
        'Messages and social relationships',
        'Marketplace, job, service and channel data',
        'Device and technical identifiers',
        'Consent and legal-acceptance records',
        'Usage and activity observations',
        'Security and audit records',
        'Derived interest-profile information'
      ],

      recipients: [
        'Authorized Folcen personnel where access is necessary',
        'Infrastructure and hosting processors used to operate Folcen',
        'Authentication providers used for account authentication',
        'Notification-delivery providers used for push notifications'
      ],

      retention: {
        accountDeletionGraceDays:
          Number(
            process.env.DATA_RETENTION_DAYS ||
            30
          ),

        analyticsEventDays:
          Number(
            process.env.ANALYTICS_EVENT_RETENTION_DAYS ||
            30
          ),

        interestProfileDays:
          90,

        activityDays:
          Number(
            process.env.ACTIVITY_RETENTION_DAYS ||
            90
          ),

        notificationDays:
          Number(
            process.env.NOTIFICATION_RETENTION_DAYS ||
            90
          ),

        callEventDays:
          Number(
            process.env.CALL_EVENT_RETENTION_DAYS ||
            90
          ),

        messageEventDays:
          Number(
            process.env.MESSAGE_EVENT_RETENTION_DAYS ||
            60
          ),

        dailyActivityDays:
          Number(
            process.env.USER_ACTIVITY_DAILY_RETENTION_DAYS ||
            365
          ),

        auditLogDays:
          Math.max(
            365,
            Number(
              process.env.AUDIT_LOG_RETENTION_DAYS ||
              1095
            )
          ),

        authEventDays:
          process.env.AUTH_EVENT_RETENTION_DAYS
            ? Number(
                process.env.AUTH_EVENT_RETENTION_DAYS
              )
            : null
      },

      rights: [
        'Right of access',
        'Right to rectification',
        'Right to erasure where applicable',
        'Right to restriction where applicable',
        'Right to object where applicable',
        'Right to data portability where applicable',
        'Right to withdraw consent where processing relies on consent',
        'Right to lodge a complaint with a supervisory authority'
      ],

      source: {
        providedByUser: [
          'Account and profile information',
          'Posts, comments and messages sent',
          'Listings, jobs, services and channels created',
          'Reports and requests submitted',
          'Consent and legal-acceptance choices'
        ],

        observedFromUse: [
          'Activity records',
          'Call and message delivery events',
          'Analytics events when analytics consent is enabled',
          'Daily activity records',
          'Device and peer identifiers'
        ],

        derivedByFolcen: [
          'Aggregated interest profile when enabled'
        ],

        generatedBySecuritySystems: [
          'Authentication events',
          'Audit records'
        ]
      },

      automatedDecisionMaking: {
        profiling: {
          analytics:
            consentRecord
              ? consentRecord.analytics_optin === true
              : false,

          personalization:
            consentRecord
              ? consentRecord.personalization === true
              : false
        },

        solelyAutomatedDecisionsWithLegalOrSimilarlySignificantEffects:
          false,

        note:
          'The current Folcen processing inventory includes consent-based analytics and personalization support; no solely automated decision with legal or similarly significant effect is represented in this DSAR inventory.'
      }
    };


    const personalData = {
      posts,
      comments,
      messages,
      followers,
      following,
      callEvents,
      messageEvents,
      notifications,

      consentRecord,

      interestProfile,

      analyticsEvents,

      dailyActivity,

      authEvents,

      activities,

      reports,

      reportsAboutUser,

      products,

      jobs,

      services,

      channels,

      requests,

      pushTokens,

      subscriptions,

      peerIdentifiers:
        peerIdentifier
          ? [peerIdentifier]
          : [],

      auditLogs,

      legalAcceptances
    };


    await recordAudit({
      actorId:
        actor._id,

      actorRole:
        actor.role,

      action:
        'ACCESS',

      targetUserId:
        target._id,

      details: {
        reason:
          'GDPR Data Access Request',

        fields:
          Object.keys(
            personalData
          ),

        page,
        limit,
        complete:
          paginationManifest.complete
      },

      ip:
        req.ip,

      userAgent:
        req.get(
          'User-Agent'
        )
    });


    return Response.sendResponse(
      res,
      {
        user:
          account,

        personalData,

        processingInformation,

        paginationManifest
      }
    );

  } catch (e) {
    console.error(
      'GDPR access error',
      e
    );

    return Response.sendError(
      res,
      500,
      'Server error'
    );
  }
};

exports.portability = async (req, res) => {
  try {
    const actor = req.authUser;
    let target = actor;

    if (
      req.query &&
      req.query.userId
    ) {
      if (
        !canActOnUser(
          actor,
          req.query.userId
        )
      ) {
        return Response.sendError(
          res,
          403,
          'Access forbidden'
        );
      }

      target =
        await User.findById(
          req.query.userId
        );

      if (!target) {
        return Response.sendResponse(
          res,
          {},
          'Request processed'
        );
      }
    }


    const page = Math.max(
      1,
      parseInt(
        req.query.page || '1',
        10
      ) || 1
    );

    const limit = Math.min(
      100,
      Math.max(
        1,
        parseInt(
          req.query.limit || '50',
          10
        ) || 50
      )
    );

    const skip =
      (page - 1) *
      limit;

    const userId =
      target._id;


    // Preserve the existing export datasets and top-level response shape.
    const posts = await Post.find({
      user: userId
    })
      .sort({ _id: 1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const comments = await Comment.find({
      user: userId
    })
      .sort({ _id: 1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const messages = await Message.find({
      $or: [
        { from: userId },
        { to: userId }
      ]
    })
      .sort({ _id: 1 })
      .skip(skip)
      .limit(limit)
      .lean();


    const Follow =
      require('../models/Follow');

    const followers = await Follow.find({
      followed: userId
    })
      .sort({ _id: 1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const following = await Follow.find({
      follower: userId
    })
      .sort({ _id: 1 })
      .skip(skip)
      .limit(limit)
      .lean();


    const CallEvent =
      require('../models/CallEvent');

    const MessageEvent =
      require('../models/MessageEvent');

    const callEvents = await CallEvent.find({
      $or: [
        { initiatedBy: userId },
        { participants: userId }
      ]
    })
      .sort({ _id: 1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const messageEvents = await MessageEvent.find({
      $or: [
        { from: userId },
        { to: userId }
      ]
    })
      .sort({ _id: 1 })
      .skip(skip)
      .limit(limit)
      .lean();


    const Activity =
      require('../models/Activity');

    const Report =
      require('../models/Report');

    const Product =
      require('../models/Product');

    const Job =
      require('../models/Job');

    const Service =
      require('../models/Service');

    const Channel =
      require('../models/Channel');

    const Request =
      require('../models/Request');

    const AnalyticsEvent =
      require('../models/AnalyticsEvent');

    const UserActivityDaily =
      require('../models/UserActivityDaily');

    const Subscription =
      require('../models/Subscription');

    const LegalAcceptance =
      require('../models/LegalAcceptance');


    const activities = await Activity.find({
      actor: userId
    })
      .sort({ _id: 1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const reports = await Report.find({
      reporter: userId
    })
      .sort({ _id: 1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const products = await Product.find({
      user: userId
    })
      .sort({ _id: 1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const jobs = await Job.find({
      user: userId
    })
      .sort({ _id: 1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const services = await Service.find({
      user: userId
    })
      .sort({ _id: 1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const channels = await Channel.find({
      user: userId
    })
      .sort({ _id: 1 })
      .skip(skip)
      .limit(limit)
      .lean();


    const requests = await Request.find({
      $or: [
        { from: userId },
        { to: userId }
      ]
    })
      .sort({ _id: 1 })
      .skip(skip)
      .limit(limit)
      .lean();


    const Notification =
      require('../models/Notification');

    const notifications = await Notification.find({
      recipient: userId
    })
      .select(
        'type title body data read createdAt'
      )
      .sort({ _id: 1 })
      .skip(skip)
      .limit(limit)
      .lean();


    let consentRecord = null;

    try {
      const UserConsent =
        require('../models/UserConsent');

      consentRecord =
        await UserConsent.findOne({
          userId
        })
          .select(
            '-_id analytics_optin personalization createdAt updatedAt history'
          )
          .lean();
    } catch (_) {}


    // Article 20 observed data: raw events generated from the user's
    // interaction with Folcen while analytics processing is enabled.
    const analyticsEvents = await AnalyticsEvent.find({
      userId
    })
      .select(
        'eventType targetId targetType category channelId tags createdAt'
      )
      .sort({ _id: 1 })
      .skip(skip)
      .limit(limit)
      .lean();


    const dailyActivity =
      await UserActivityDaily.find({
        userId
      })
        .sort({ _id: 1 })
        .skip(skip)
        .limit(limit)
        .lean();


    const subscriptions =
      await Subscription.find({
        userId
      })
        .sort({ _id: 1 })
        .skip(skip)
        .limit(limit)
        .lean();


    // Derived analytics remain supplementary and are not represented as
    // the core Article 20 portable dataset.
    let analyticsEventSummary = null;

    try {
      const evtAgg =
        await AnalyticsEvent.aggregate([
          {
            $match: {
              userId
            }
          },
          {
            $group: {
              _id:
                '$eventType',

              count: {
                $sum: 1
              }
            }
          }
        ]);

      analyticsEventSummary = {
        note:
          'Derived aggregate counts supplied as supplementary information; raw observed analytics events are provided separately when present.',

        counts:
          Object.fromEntries(
            evtAgg.map(
              event => [
                event._id,
                event.count
              ]
            )
          )
      };

    } catch (_) {}


    // Legal acceptance history.
    const {
      getAcceptancesForUser
    } = require(
      '../utils/legalAccept'
    );

    const acceptanceRows =
      await getAcceptancesForUser(
        userId,
        {
          page,
          limit
        }
      );

    const legalAcceptances =
      acceptanceRows.map(
        acceptance => {
          let acceptedAt =
            acceptance.acceptedAt ||
            acceptance.createdAt;

          if (
            !acceptedAt &&
            acceptance._id
          ) {
            try {
              if (
                typeof acceptance._id.getTimestamp ===
                'function'
              ) {
                acceptedAt =
                  acceptance._id.getTimestamp();

              } else if (
                typeof acceptance._id ===
                  'string' &&
                acceptance._id.length ===
                  24
              ) {
                acceptedAt =
                  new Date(
                    parseInt(
                      acceptance._id.substring(
                        0,
                        8
                      ),
                      16
                    ) *
                    1000
                  );
              }
            } catch (_) {}
          }

          const meta =
            acceptance.meta || {};

          return {
            documentType:
              acceptance.documentType,

            documentVersion:
              acceptance.documentVersion,

            acceptedAt:
              acceptedAt ||
              new Date(),

            acceptanceContext:
              acceptance.acceptanceContext ||
              'unknown',

            meta: {
              ip:
                meta.ip ||
                'Legacy Record',

              userAgent:
                meta.userAgent ||
                'Legacy Record',

              clientType:
                meta.clientType ||
                'mobile_app'
            }
          };
        }
      );


    const [
      postsTotal,
      commentsTotal,
      messagesTotal,
      followersTotal,
      followingTotal,
      callEventsTotal,
      messageEventsTotal,
      activitiesTotal,
      reportsTotal,
      productsTotal,
      jobsTotal,
      servicesTotal,
      channelsTotal,
      notificationsTotal,
      requestsTotal,
      analyticsEventsTotal,
      dailyActivityTotal,
      subscriptionsTotal,
      legalAcceptancesTotal
    ] = await Promise.all([
      Post.countDocuments({
        user: userId
      }),

      Comment.countDocuments({
        user: userId
      }),

      Message.countDocuments({
        $or: [
          { from: userId },
          { to: userId }
        ]
      }),

      Follow.countDocuments({
        followed: userId
      }),

      Follow.countDocuments({
        follower: userId
      }),

      CallEvent.countDocuments({
        $or: [
          { initiatedBy: userId },
          { participants: userId }
        ]
      }),

      MessageEvent.countDocuments({
        $or: [
          { from: userId },
          { to: userId }
        ]
      }),

      Activity.countDocuments({
        actor: userId
      }),

      Report.countDocuments({
        reporter: userId
      }),

      Product.countDocuments({
        user: userId
      }),

      Job.countDocuments({
        user: userId
      }),

      Service.countDocuments({
        user: userId
      }),

      Channel.countDocuments({
        user: userId
      }),

      Notification.countDocuments({
        recipient: userId
      }),

      Request.countDocuments({
        $or: [
          { from: userId },
          { to: userId }
        ]
      }),

      AnalyticsEvent.countDocuments({
        userId
      }),

      UserActivityDaily.countDocuments({
        userId
      }),

      Subscription.countDocuments({
        userId
      }),

      LegalAcceptance.countDocuments({
        userId
      })
    ]);


    const totals = {
      posts:
        postsTotal,

      comments:
        commentsTotal,

      messages:
        messagesTotal,

      followers:
        followersTotal,

      following:
        followingTotal,

      callEvents:
        callEventsTotal,

      messageEvents:
        messageEventsTotal,

      activities:
        activitiesTotal,

      reports:
        reportsTotal,

      products:
        productsTotal,

      jobs:
        jobsTotal,

      services:
        servicesTotal,

      channels:
        channelsTotal,

      notifications:
        notificationsTotal,

      requests:
        requestsTotal,

      analyticsEvents:
        analyticsEventsTotal,

      dailyActivity:
        dailyActivityTotal,

      subscriptions:
        subscriptionsTotal,

      legalAcceptances:
        legalAcceptancesTotal
    };


    const paginationManifest =
      buildPaginationManifest(
        totals,
        {
          posts,
          comments,
          messages,
          followers,
          following,
          callEvents,
          messageEvents,
          activities,
          reports,
          products,
          jobs,
          services,
          channels,
          notifications,
          requests,
          analyticsEvents,
          dailyActivity,
          subscriptions,
          legalAcceptances
        },
        page,
        limit
      );


    const {
      hasMore,
      nextPage,
      complete
    } = paginationManifest;


    const portableProfile = {
      firstName:
        target.firstName || '',

      lastName:
        target.lastName || '',

      email:
        target.email || '',

      phone:
        target.phone || '',

      birthDate:
        target.birthDate || '',

      gender:
        target.gender || '',

      country:
        target.country || '',

      city:
        target.city || '',

      aboutMe:
        target.aboutMe || '',

      school:
        target.school || '',

      education:
        target.education || '',

      profession:
        target.profession || '',

      interests:
        target.interests || [],

      languages:
        target.languages || [],

      ageVisible:
        target.ageVisible,

      randomVisible:
        target.randomVisible,

      isPrivate:
        target.isPrivate,

      allowVideoRequestsFromNonFriends:
        target.allowVideoRequestsFromNonFriends,

      avatarStyle:
        target.avatarStyle,

      avatarSeed:
        target.avatarSeed,

      avatarVariant:
        target.avatarVariant,

      avatarOverrides:
        target.avatarOverrides
    };


    const messagesSent =
      messages.filter(
        message =>
          String(
            message.from
          ) ===
          String(userId)
      );

    const messagesReceived =
      messages.filter(
        message =>
          String(
            message.from
          ) !==
          String(userId)
      );


    const requestsSent =
      requests.filter(
        request =>
          String(
            request.from
          ) ===
          String(userId)
      );

    const requestsReceived =
      requests.filter(
        request =>
          String(
            request.from
          ) !==
          String(userId)
      );


    // Core Article 20 classification:
    // data supplied by the user or observed from the user's use of Folcen.
    const portableData = {
      profile:
        portableProfile,

      posts,

      comments,

      messages:
        messagesSent,

      following,

      callEvents,

      messageEvents,

      activities,

      reports,

      products,

      jobs,

      services,

      channels,

      requests:
        requestsSent,

      analyticsEvents,

      dailyActivity,

      subscriptions,

      consentRecord,

      legalAcceptances
    };


    // Additional useful information which is not represented as core
    // portable data because it is generated by Folcen, provided by another
    // user, or derived from observed data.
    const supplementary = {
      messagesReceived,

      followers,

      requestsReceived,

      notifications,

      derived: {
        analyticsEventSummary
      }
    };


    const exportObj = {
      // Preserve historical top-level compatibility.
      user:
        sanitizeUserForDsar(
          target
        ),

      posts,
      comments,
      messages,
      followers,
      following,
      callEvents,
      messageEvents,
      activities,
      reports,
      products,
      jobs,
      services,
      channels,
      notifications,
      requests,
      analyticsEvents,
      dailyActivity,
      subscriptions,
      consentRecord,
      analyticsEventSummary,

      portableData,

      supplementary,

      page,
      limit,

      totals,

      paginationManifest,

      hasMore,

      nextPage,

      complete
    };


    // Preserve explicit legalAcceptances compatibility field.
    exportObj.legalAcceptances =
      legalAcceptances;


    await recordAudit({
      actorId:
        actor._id,

      actorRole:
        actor.role,

      action:
        'EXPORT',

      targetUserId:
        target._id,

      details: {
        reason:
          'GDPR Data Portability Export',

        page,
        limit,

        complete,

        counts: {
          posts:
            posts.length,

          comments:
            comments.length,

          messages:
            messages.length,

          notifications:
            notifications.length,

          requests:
            requests.length,

          analyticsEvents:
            analyticsEvents.length
        }
      },

      ip:
        req.ip,

      userAgent:
        req.get(
          'User-Agent'
        )
    });


    return Response.sendResponse(
      res,
      exportObj
    );

  } catch (e) {
    console.error(
      'GDPR portability error',
      e
    );

    return Response.sendError(
      res,
      500,
      'Server error'
    );
  }
};

exports.rectify = async (req, res) => {
  try {
    const actor = req.authUser;
    const { field, newValue } = req.body || {};

    const requestedTargetId =
      (req.params && req.params.userId) ||
      (req.body && req.body.userId) ||
      actor._id;

    if (!canActOnUser(actor, requestedTargetId)) {
      return Response.sendError(res, 403, 'Access forbidden');
    }

    let target = actor;

    if (String(requestedTargetId) !== String(actor._id)) {
      target = await User.findById(requestedTargetId);

      if (!target) {
        return Response.sendResponse(res, {}, 'Request processed');
      }
    }

    const updates = {};

    // Self-service POST contract validated by rectifySchema:
    // { field, newValue }.
    if (field) {
      if (
        !ALLOWED_RECTIFY_FIELDS.includes(field) ||
        newValue === undefined
      ) {
        return Response.sendError(res, 400, 'Invalid input');
      }

      updates[field] = newValue;
    } else if (req.params && req.params.userId) {
      // Preserve the existing admin dashboard PUT compatibility path,
      // which may submit multiple allowed fields in one request.
      for (const key of Object.keys(req.body || {})) {
        if (ALLOWED_RECTIFY_FIELDS.includes(key)) {
          updates[key] = req.body[key];
        }
      }
    }

    if (Object.keys(updates).length === 0) {
      return Response.sendError(res, 400, 'Invalid input');
    }

    Object.assign(target, updates);
    await target.save();

    await recordAudit({
      actorId: actor._id,
      actorRole: actor.role,
      action: 'DSAR_RECTIFY',
      targetUserId: target._id,
      details: { updates },
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    return Response.sendResponse(
      res,
      { user: sanitizeUserForDsar(target) },
      'User updated'
    );
  } catch (e) {
    console.error('GDPR rectify error', e);
    return Response.sendError(res, 500, 'Server error');
  }
};

// Soft delete (erase) with immediate revocation and scheduled purge
exports.erase = async (req, res) => {
  try {
    const io =
      req.app &&
      typeof req.app.get === 'function'
        ? req.app.get('io')
        : null;

    const actor =
      req.authUser;

    let target =
      actor;

    const isAdmin =
      actor.role === 'ADMIN' ||
      actor.role === 'SUPER ADMIN';


    if (
      req.body &&
      req.body.userId
    ) {

      // Only ADMIN / SUPER ADMIN may execute Article 17 erasure
      // for another user.
      if (
        !isAdmin
      ) {
        return Response.sendError(
          res,
          403,
          'Access forbidden'
        );
      }


      target =
        await User.findById(
          req.body.userId
        );


      if (
        !target
      ) {
        return Response.sendResponse(
          res,
          {},
          'Request processed'
        );
      }
    }


    const targetId =
      target._id;


    const isCrossUserErasure =
      String(actor._id) !==
      String(targetId);


    const now =
      new Date();


    const reason =
      (
        req.body &&
        req.body.reason
      ) ||
      'Data subject Article 17 erasure request';


    /**
     * GDPR Article 17 erasure is intentionally NOT the ordinary recoverable
     * "Delete Account" flow.
     *
     * Delete Account may use a grace period and restore path.
     * This endpoint performs the Article 17 exception assessment and then
     * permanently purges erasable account data immediately.
     */
    const retentionPlan =
      await buildErasureRetentionPlan(
        targetId
      );


    // Optional/ordinary account processing must stop immediately even before
    // the physical purge completes.
    try {

      await tokenBlacklist.revokeUser(
        String(
          targetId
        )
      );

    } catch (
      revokeError
    ) {

      console.warn(
        '[GDPR Erasure] Token revocation warning:',
        revokeError.message
      );
    }


    const auditAction =
      isCrossUserErasure
        ? 'ERASURE_HARD'
        : 'ERASURE_ART17_SELF';


    // Record the request before physical purge. The retained audit category
    // is subject to the separate B2 minimization/finite-retention controls.
    await recordAudit({
      actorId:
        actor._id,

      actorRole:
        actor.role,

      action:
        auditAction,

      targetUserId:
        targetId,

      details: {
        reason,

        method:
          isCrossUserErasure
            ? 'ADMIN_PURGE'
            : 'ARTICLE_17_SELF_PURGE',

        article17:
          true,

        exceptionAssessment:
          retentionPlan.exceptionAssessment,

        retainedCategories:
          retentionPlan.retainedCategories.map(
            item =>
              item.category
          )
      },

      ip:
        req.ip,

      userAgent:
        req.get('User-Agent')
    });


    // Preserve the established ADMIN/SUPER ADMIN cross-user hard-erasure
    // behavior while applying the same Article 17 assessment.
    if (
      isAdmin &&
      String(actor._id) !== String(target._id)
    ) {

      console.log(
        `[GDPR Hard Erase] Admin ${actor._id} is purging user ${target._id}. Reason: ${reason}`
      );

      // Existing audit action name retained for administrative evidence:
      // ERASURE_HARD.
    }


    // Article 17 erasure performs an immediate physical purge.
    await purgeUser(target._id);


    // Security/accountability records are not blindly deleted. Instead,
    // remove the erased user's direct identity and raw technical identifiers
    // while their finite retention window remains applicable.
    await minimizeRetainedErasureEvidence(
      target._id
    );


    // Disconnect all active sessions/sockets for the erased identity.
    try {

      const sockets =
        userSocketIds(
          targetId
        );


      if (
        sockets &&
        io &&
        io.sockets
      ) {

        for (
          const sid
          of sockets
        ) {

          try {

            const socket =
              io.sockets.sockets.get(
                sid
              );


            if (
              socket
            ) {

              socket.emit(
                'force-logout',
                {
                  reason:
                    'Account permanently erased following an Article 17 request'
                }
              );


              socket.disconnect(
                true
              );
            }

          } catch (
            socketError
          ) {
            // Best-effort disconnect after the server-side account purge.
          }
        }
      }

    } catch (
      disconnectError
    ) {

      console.warn(
        '[GDPR Erasure] Socket disconnect warning:',
        disconnectError.message
      );
    }


    const retainedCategories =
      retentionPlan.retainedCategories;


    const retentionReason =
      retentionPlan.retentionReason;


    const response = {
      deletedAt:
        now,

      purged:
        true,

      article17:
        true,

      exceptionAssessment:
        retentionPlan.exceptionAssessment,

      retainedCategories,

      retentionReason,

      // Article 12(4) transparency/remedy information when any portion of
      // personal data is retained under an Article 17 exception.
      supervisoryAuthority:
        'Datatilsynet — Norwegian Data Protection Authority',

      judicialRemedy:
        'You may lodge a complaint with the supervisory authority and seek an effective judicial remedy under GDPR Articles 78 and 79.'
    };


    const message =
      retainedCategories.length
        ? 'Account data erased. Limited categories may remain temporarily where an Article 17 exception applies; details are included in this response.'
        : 'Account permanently erased and erasable personal data purged.';


    return Response.sendResponse(
      res,
      response,
      message
    );

  } catch (
    error
  ) {

    console.error(
      'GDPR erase error',
      error
    );


    return Response.sendError(
      res,
      500,
      'Server error'
    );
  }
};

exports.consentHistory = async (req, res) => {
  try {
    const actor = req.authUser;
    let target = actor;
    if (req.query && req.query.userId) {
      if (!canActOnUser(actor, req.query.userId)) {
        return Response.sendError(res, 403, 'Access forbidden');
      }

      target = await User.findById(req.query.userId);
      if (!target) {
        return Response.sendResponse(res, {}, 'Request processed');
      }
    }

    const { getAcceptancesForUser } = require('../utils/legalAccept');
    const acceptances = await getAcceptancesForUser(target._id, { page: 1, limit: 1000 });
    const history = acceptances.map(a => ({ 
      documentType: a.documentType, 
      version: a.documentVersion, 
      ts: a.acceptedAt || a.createdAt, 
      context: a.acceptanceContext,
      meta: a.meta || {}
    }));

    await recordAudit({ actorId: actor._id, actorRole: actor.role, action: 'DSAR_CONSENT_HISTORY', targetUserId: target._id, details: { count: history.length }, ip: req.ip, userAgent: req.get('User-Agent') });
    return Response.sendResponse(res, { consents: history });
  } catch (e) {
    console.error('GDPR consentHistory error', e);
    return Response.sendError(res, 500, 'Server error');
  }
};

exports.auditLogs = async (req, res) => {
  try {
    const actor = req.authUser;
    const isAdmin = actor.role === 'ADMIN' || actor.role === 'SUPER ADMIN';
    if (!isAdmin) return Response.sendError(res, 403, 'Access forbidden');

    const qUserId = req.query.userId || null;
    const qAction = req.query.action || null;

    const AuditLog = require('../models/AuditLog');
    const page = Math.max(1, parseInt(req.query.page || '1'));
    const limit = Math.min(200, parseInt(req.query.limit || '50'));
    const skip = (page - 1) * limit;

    const filter = {};
    if (qUserId) filter.targetUserId = qUserId;
    if (qAction) filter.action = { $regex: qAction, $options: 'i' };

    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limit)
        .populate('actorId', 'firstName lastName email role')
        .lean(),
      AuditLog.countDocuments(filter),
    ]);

    return Response.sendResponse(res, {
      docs: logs,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    });
  } catch (e) {
    console.error('GDPR auditLogs error', e);
    return Response.sendError(res, 500, 'Server error');
  }
};

// ─────────────────── Dry-run erasure preview ───────────────────
exports.erasePreview = async (req, res) => {
  try {
    const actor = req.authUser;
    const isAdmin = actor.role === 'ADMIN' || actor.role === 'SUPER ADMIN';
    if (!isAdmin) return Response.sendError(res, 403, 'Access forbidden');

    const targetId = req.query.userId || req.body.userId;
    if (!targetId) return Response.sendError(res, 400, 'userId required');

    const target = await User.findById(targetId).select('_id firstName lastName email').lean();
    if (!target) return Response.sendResponse(res, {}, 'User not found');

    const userId = target._id;

    const [
      posts, comments, messages, notifications, activities,
      pushTokens, follows, dailyActivity, analyticsEvents
    ] = await Promise.all([
      require('../models/Post').countDocuments({ user: userId }),
      require('../models/Comment').countDocuments({ user: userId }),
      require('../models/Message').countDocuments({ $or: [{ from: userId }, { to: userId }] }),
      require('../models/Notification').countDocuments({ $or: [{ recipient: userId }, { sender: userId }] }),
      require('../models/Activity').countDocuments({ actor: userId }),
      require('../models/PushToken').countDocuments({ userId }),
      require('../models/Follow').countDocuments({ $or: [{ follower: userId }, { followed: userId }] }),
      require('../models/UserActivityDaily').countDocuments({ userId }),
      (async () => { try { return await require('../models/AnalyticsEvent').countDocuments({ userId }); } catch (e) { return 0; } })(),
    ]);

    let interestProfile = false;
    let consents = false;
    try { interestProfile = !!(await require('../models/UserInterestProfile').findOne({ userId }).select('_id').lean()); } catch (e) {}
    try { consents = !!(await require('../models/UserConsent').findOne({ userId }).select('_id').lean()); } catch (e) {}

    await recordAudit({ actorId: actor._id, actorRole: actor.role, action: 'ERASURE_PREVIEW', targetUserId: userId, details: { dry_run: true }, ip: req.ip, userAgent: req.get('User-Agent') });

    return Response.sendResponse(res, {
      userId: target._id,
      name: `${target.firstName || ''} ${target.lastName || ''}`.trim(),
      email: target.email,
      wouldDelete: { posts, comments, messages, notifications, activities, pushTokens, follows, dailyActivity, analyticsEvents, interestProfile, consents }
    });
  } catch (e) {
    console.error('GDPR erasePreview error', e);
    return Response.sendError(res, 500, 'Server error');
  }
};

// ─────────────────── Anonymize all posts/comments by user ──────
const ANON_PLACEHOLDER_ID = '000000000000000000000000';
exports.anonymizeAuthor = async (req, res) => {
  try {
    const actor = req.authUser;
    const isAdmin = actor.role === 'ADMIN' || actor.role === 'SUPER ADMIN';
    if (!isAdmin) return Response.sendError(res, 403, 'Access forbidden');

    const targetId = req.body.userId;
    if (!targetId) return Response.sendError(res, 400, 'userId required');
    const reason = req.body.reason || 'GDPR anonymization request';

    const Post = require('../models/Post');
    const Comment = require('../models/Comment');
    const mongoose = require('mongoose');
    const anonId = new mongoose.Types.ObjectId(ANON_PLACEHOLDER_ID);

    const [postRes, commentRes] = await Promise.all([
      Post.updateMany({ user: targetId }, { $set: { user: anonId, anonyme: true } }),
      Comment.updateMany({ user: targetId }, { $set: { user: anonId, anonyme: true } }),
    ]);

    await recordAudit({ actorId: actor._id, actorRole: actor.role, action: 'ANONYMIZE_AUTHOR', targetUserId: targetId, details: { reason, posts: postRes.modifiedCount, comments: commentRes.modifiedCount }, ip: req.ip, userAgent: req.get('User-Agent') });

    return Response.sendResponse(res, { posts: postRes.modifiedCount, comments: commentRes.modifiedCount }, 'Author anonymized');
  } catch (e) {
    console.error('GDPR anonymizeAuthor error', e);
    return Response.sendError(res, 500, 'Server error');
  }
};

// ─────────────────── Consent management ────────────────────────
exports.consentStatus = async (req, res) => {
  try {
    const actor = req.authUser;
    const isAdmin = actor.role === 'ADMIN' || actor.role === 'SUPER ADMIN';
    let targetId = actor._id;
    if (req.query.userId) {
      if (!isAdmin) return Response.sendError(res, 403, 'Access forbidden');
      targetId = req.query.userId;
    }

    const UserConsent = require('../models/UserConsent');
    const consent = await UserConsent.findOne({ userId: targetId }).lean();
    return Response.sendResponse(res, {
      userId: targetId,
      analytics_optin: consent ? consent.analytics_optin : false,
      updatedAt: consent ? consent.updatedAt : null,
    });
  } catch (e) {
    console.error('GDPR consentStatus error', e);
    return Response.sendError(res, 500, 'Server error');
  }
};

const ALLOWED_CONSENT_KEYS = ['analytics_optin'];
exports.updateConsent = async (req, res) => {
  try {
    const actor = req.authUser;
    const isAdmin = actor.role === 'ADMIN' || actor.role === 'SUPER ADMIN';
    let targetId = actor._id;
    if (req.body.userId && String(req.body.userId) !== String(actor._id)) {
      if (!isAdmin) return Response.sendError(res, 403, 'Access forbidden');
      targetId = req.body.userId;
    }

    const { key, value } = req.body;
    if (!ALLOWED_CONSENT_KEYS.includes(key)) return Response.sendError(res, 400, 'Invalid consent key');
    if (typeof value !== 'boolean') return Response.sendError(res, 400, 'value must be boolean');

    const isCrossUserConsentChange =
      String(targetId) !== String(actor._id);

    // Optional affirmative consent must originate from the data subject.
    // An administrator may withdraw/disable consent for another user when
    // handling a request, but cannot manufacture an opt-in on their behalf.
    if (isCrossUserConsentChange && value === true) {
      return Response.sendError(
        res,
        403,
        'Only the data subject can grant optional consent'
      );
    }

    const UserConsent = require('../models/UserConsent');
    const existing = await UserConsent.findOne({ userId: targetId });
    const oldValue = existing ? existing[key] : false;

    const historyEntry = {
      key,
      oldValue,
      newValue: value,
      changedAt: new Date(),
      changedBy: actor._id,
      source: isCrossUserConsentChange ? 'admin' : 'self'
    };

    const updated = await UserConsent.findOneAndUpdate(
      { userId: targetId },
      { $set: { [key]: value, updatedAt: new Date() }, $push: { history: historyEntry } },
      { upsert: true, new: true }
    );

    // If user opts out of analytics, delete their interest profile
    if (key === 'analytics_optin' && value === false) {
      try { await require('../models/UserInterestProfile').deleteOne({ userId: targetId }); } catch (e) {}
    }

    await recordAudit({ actorId: actor._id, actorRole: actor.role, action: 'CONSENT_CHANGE', targetUserId: targetId, details: { key, oldValue, newValue: value }, ip: req.ip, userAgent: req.get('User-Agent') });

    return Response.sendResponse(res, { userId: targetId, [key]: updated[key] }, 'Consent updated');
  } catch (e) {
    console.error('GDPR updateConsent error', e);
    return Response.sendError(res, 500, 'Server error');
  }
};
