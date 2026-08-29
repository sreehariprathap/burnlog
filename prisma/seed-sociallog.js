// prisma/seed-sociallog.js
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

// Stable synthetic UUIDs — these are demo "official account" personas with
// no matching auth.users row (they can't log in), same idea as Instagram's
// bundled/suggested accounts on a fresh install. Fixed IDs make the script
// idempotent: re-running it upserts the same rows instead of duplicating.
const PERSONAS = [
  {
    id: '11111111-1111-1111-1111-111111111101',
    username: 'burnlog_official',
    firstName: 'BurnLog',
    lastName: 'Team',
    bio: 'Official BurnLog account. PRs, streaks, and workout tips.',
  },
  {
    id: '11111111-1111-1111-1111-111111111102',
    username: 'tasklog_tips',
    firstName: 'TaskLog',
    lastName: 'Tips',
    bio: 'Productivity tips from the TaskLog team.',
  },
  {
    id: '11111111-1111-1111-1111-111111111103',
    username: 'homelog_hq',
    firstName: 'HomeLog',
    lastName: 'HQ',
    bio: 'Running a household, made easier.',
  },
  {
    id: '11111111-1111-1111-1111-111111111104',
    username: 'lifelog_money',
    firstName: 'LifeLog',
    lastName: 'Money',
    bio: 'Budgeting and money tips.',
  },
  {
    id: '11111111-1111-1111-1111-111111111105',
    username: 'maya_runs',
    firstName: 'Maya',
    lastName: 'Chen',
    bio: 'Marathon training. Sharing the ups and downs.',
  },
  {
    id: '11111111-1111-1111-1111-111111111106',
    username: 'devon_builds',
    firstName: 'Devon',
    lastName: 'Okafor',
    bio: 'Shipping side projects one task at a time.',
  },
]

const POSTS = [
  { author: 0, kind: 'TEXT', body: 'New PR on deadlifts today. #fitness Consistency beats intensity, every time.', hoursAgo: 2 },
  { author: 0, kind: 'CROSS_APP_ACTIVITY', body: 'Hit a 14-day workout streak 🔥', sourceApp: 'burnlog', sourceRefType: 'streak_milestone', hoursAgo: 20 },
  { author: 1, kind: 'TEXT', body: 'Tip: timebox your inbox to 2x 20-minute blocks a day. #productivity', hoursAgo: 5 },
  { author: 1, kind: 'CROSS_APP_ACTIVITY', body: 'Completed "Ship SocialLog Foundation"', sourceApp: 'tasklog', sourceRefType: 'task_completed', hoursAgo: 1 },
  { author: 2, kind: 'TEXT', body: 'Chore rotation actually works if everyone can see the schedule. #homelog', hoursAgo: 30 },
  { author: 3, kind: 'TEXT', body: 'Zero-based budgeting month 3: still boring, still working. #money', hoursAgo: 10 },
  { author: 4, kind: 'TEXT', body: '18 miles this morning, legs are done. #fitness', hoursAgo: 3 },
  { author: 4, kind: 'CROSS_APP_ACTIVITY', body: 'Hit a 7-day workout streak 🔥', sourceApp: 'burnlog', sourceRefType: 'streak_milestone', hoursAgo: 50 },
  { author: 5, kind: 'TEXT', body: 'Refactored the onboarding flow, conversion should be better now. #productivity', hoursAgo: 8 },
  { author: 5, kind: 'TEXT', body: 'Anyone else use #topics to organize side-project notes?', hoursAgo: 40 },
]

const COMMENTS = [
  { post: 0, author: 4, body: 'Let\'s go! What\'s your program?' },
  { post: 0, author: 5, body: 'Deadlifts are the best PR to chase.' },
  { post: 2, author: 5, body: 'Stealing this.' },
  { post: 6, author: 0, body: 'Legend. Recovery day tomorrow?' },
  { post: 8, author: 1, body: 'Nice — what did conversion look like before?' },
]

const VOTES = [
  [0, 1, 1], [0, 4, 1], [0, 5, 1],
  [1, 4, 1], [1, 2, 1],
  [2, 5, 1], [2, 0, 1], [2, 3, -1],
  [3, 1, 1],
  [4, 3, 1], [4, 2, 1],
  [6, 0, 1], [6, 1, 1], [6, 5, 1],
  [8, 0, 1], [8, 4, 1],
]

async function main() {
  const followUserId = process.env.SEED_FOLLOW_USER_ID || null

  const personaProfiles = []
  for (const p of PERSONAS) {
    const profile = await prisma.profile.upsert({
      where: { userId: p.id },
      update: {},
      create: {
        userId: p.id,
        username: p.username,
        firstName: p.firstName,
        lastName: p.lastName,
        age: 28,
        weight: 70,
        height: 175,
        activityLevel: 'moderate',
      },
    })
    await prisma.socialProfileSettings.upsert({
      where: { profileId: profile.id },
      update: { bio: p.bio },
      create: { profileId: profile.id, bio: p.bio, isPrivate: false, whoCanMessage: 'everyone', showCrossAppActivity: true },
    })
    personaProfiles.push(profile)
  }
  console.log(`✅ Seeded ${personaProfiles.length} demo personas`)

  // Mutual follow graph among personas.
  for (let i = 0; i < personaProfiles.length; i++) {
    for (let j = 0; j < personaProfiles.length; j++) {
      if (i === j) continue
      // Not fully-connected — every persona follows 3 others, deterministically.
      if ((j - i + personaProfiles.length) % personaProfiles.length > 3) continue
      await prisma.socialFollow.upsert({
        where: { followerId_followingId: { followerId: personaProfiles[i].id, followingId: personaProfiles[j].id } },
        update: {},
        create: { followerId: personaProfiles[i].id, followingId: personaProfiles[j].id },
      })
    }
  }
  console.log('✅ Seeded persona follow graph')

  const now = Date.now()
  const createdPosts = []
  for (const p of POSTS) {
    // Dedup on (profileId, body) since seed bodies are all distinct — makes
    // re-running the script idempotent without needing a schema change for
    // a dedicated seed marker column.
    let post = await prisma.socialPost.findFirst({
      where: { profileId: personaProfiles[p.author].id, body: p.body },
    })
    if (!post) {
      const createdAt = new Date(now - p.hoursAgo * 60 * 60 * 1000)
      post = await prisma.socialPost.create({
        data: {
          profileId: personaProfiles[p.author].id,
          kind: p.kind,
          body: p.body,
          sourceApp: p.sourceApp ?? null,
          sourceRefType: p.sourceRefType ?? null,
          sourceRefId: p.sourceRefType ? `seed-${p.author}-${p.hoursAgo}` : null,
          createdAt,
          updatedAt: createdAt,
        },
      })
    }
    createdPosts.push(post)

    const topicNames = Array.from(new Set((p.body.match(/#(\w+)/g) || []).map((t) => t.slice(1).toLowerCase())))
    for (const name of topicNames) {
      const topic = await prisma.socialTopic.upsert({ where: { name }, update: {}, create: { name } })
      await prisma.socialPostTopic.upsert({
        where: { postId_topicId: { postId: post.id, topicId: topic.id } },
        update: {},
        create: { postId: post.id, topicId: topic.id },
      })
    }
  }
  console.log(`✅ Seeded ${createdPosts.length} demo posts`)

  for (const c of COMMENTS) {
    const existingComment = await prisma.socialComment.findFirst({
      where: { postId: createdPosts[c.post].id, profileId: personaProfiles[c.author].id, body: c.body },
    })
    if (!existingComment) {
      await prisma.socialComment.create({
        data: { postId: createdPosts[c.post].id, profileId: personaProfiles[c.author].id, body: c.body },
      })
    }
  }
  console.log(`✅ Seeded ${COMMENTS.length} demo comments`)

  for (const [postIdx, authorIdx, value] of VOTES) {
    await prisma.socialVote.upsert({
      where: { postId_profileId: { postId: createdPosts[postIdx].id, profileId: personaProfiles[authorIdx].id } },
      update: { value },
      create: { postId: createdPosts[postIdx].id, profileId: personaProfiles[authorIdx].id, value },
    })
  }
  console.log(`✅ Seeded ${VOTES.length} demo votes`)

  if (followUserId) {
    const me = await prisma.profile.findUnique({ where: { userId: followUserId } })
    if (!me) {
      console.warn(`⚠️  SEED_FOLLOW_USER_ID=${followUserId} has no matching profile — skipping follow/DM seeding for it.`)
    } else {
      // The 3 team accounts auto-follow you (Instagram-style "suggested" bootstrap).
      for (const p of personaProfiles.slice(0, 3)) {
        await prisma.socialFollow.upsert({
          where: { followerId_followingId: { followerId: p.id, followingId: me.id } },
          update: {},
          create: { followerId: p.id, followingId: me.id },
        })
      }
      // You follow the team + Maya back.
      for (const p of [personaProfiles[0], personaProfiles[1], personaProfiles[4]]) {
        await prisma.socialFollow.upsert({
          where: { followerId_followingId: { followerId: me.id, followingId: p.id } },
          update: {},
          create: { followerId: me.id, followingId: p.id },
        })
      }
      console.log('✅ Linked demo personas to your account\'s follow graph')

      const welcomeFrom = personaProfiles[0]
      const [participantAId, participantBId] = [welcomeFrom.id, me.id].sort()
      const thread = await prisma.socialMessageThread.upsert({
        where: { participantAId_participantBId: { participantAId, participantBId } },
        update: {},
        create: { participantAId, participantBId },
      })
      const existingMessages = await prisma.socialMessage.count({ where: { threadId: thread.id } })
      if (existingMessages === 0) {
        await prisma.socialMessage.createMany({
          data: [
            { threadId: thread.id, senderId: welcomeFrom.id, body: 'Welcome to SocialLog! 👋' },
            { threadId: thread.id, senderId: welcomeFrom.id, body: 'Follow a few accounts and your feed will fill up fast.' },
          ],
        })
      }
      console.log('✅ Seeded a welcome DM thread')
    }
  } else {
    console.log('ℹ️  Set SEED_FOLLOW_USER_ID=<your-auth-uid> to also link these demo accounts to your real profile.')
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
