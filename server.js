require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const authRoutes = require("./routes/authRoutes");
const postRoutes = require("./routes/postRoutes");
const blogRoutes = require("./routes/blogRoutes");
const commentRoutes = require("./routes/commentRoutes");
const likeRoutes = require("./routes/likeRoutes");
const taskRoutes = require("./routes/taskRoutes");
const categoryRoutes = require("./routes/categoryRoutes");
const milestoneRoutes = require("./routes/milestoneRoutes");
const faqRoutes = require("./routes/faqRoutes");
const feedbackRoutes = require("./routes/feedbackRoutes");
const chatRoutes = require("./routes/chatRoutes");
const messageRoutes = require("./routes/messageRoutes");
const contactRoutes = require("./routes/contactRoutes");
const motivationaltipRoutes = require("./routes/motivationaltipRoutes");
const quickWinRoutes = require("./routes/quickWinRoutes");
const healthBodyRoutes = require("./routes/healthBodyRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const TemplateRoutes = require("./routes/TemplateRoutes");
const challengesRoutes = require("./routes/challengesRoutes");
const boardRoutes = require("./routes/boardRoutes");
const competitionRoutes = require("./routes/competitionRoutes");
const badgeRoutes = require("./routes/badgeRoutes");
const postHideRoutes = require("./routes/postHideRoutes");
const postReportRoutes = require("./routes/postReportRoutes");

const app = express();
const port = process.env.PORT || 5000;

app.use(express.json());

// Routes
app.use("/auth", authRoutes);
app.use("/posts", postRoutes);
app.use("/blogs", blogRoutes);
app.use("/comments", commentRoutes);
app.use("/likes", likeRoutes);
app.use("/tasks", taskRoutes);
app.use("/categories", categoryRoutes);
app.use("/milestones", milestoneRoutes);
app.use("/faqs", faqRoutes);
app.use("/feedback", feedbackRoutes);
app.use("/chats", chatRoutes);
app.use("/messages", messageRoutes);
app.use("/contacts", contactRoutes);
app.use("/motivationaltips", motivationaltipRoutes);
app.use("/quick-wins", quickWinRoutes);
app.use("/health-body", healthBodyRoutes);
app.use("/notifications", notificationRoutes);
app.use("/challenge-templates", TemplateRoutes);
app.use("/challenge-assignments", challengesRoutes);
app.use("/boards", boardRoutes);
app.use("/competitions", competitionRoutes);
app.use("/badges", badgeRoutes);
app.use("/post-hides", postHideRoutes);
app.use("/post-reports", postReportRoutes);

mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log("Connected to MongoDB successfully"))
    .catch((error) => console.log(error));

app.get("/", (req, res) => {
    res.send("Hello, Node and MongoDB!");
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);

    // Auto-complete challenges cron job (runs every 5 minutes)
    const Challenge = require("./models/Challenges");
    const ChallengeParticipant = require("./models/ChallengeParticipant");
    const { addXP } = require("./utils/xpSystem");
    const { checkAndAssignBadge } = require("./services/badgeService");

    setInterval(async () => {
        try {
            const now = new Date();

            // Use lean() so Mongoose does NOT try to cast/validate old docs
            // (some old challenges have category stored as a string, not ObjectId)
            const toComplete = await Challenge.find({ status: "active", endsAt: { $lte: now } })
                .lean();

            for (const challenge of toComplete) {
                // Determine winner by new challenge board stats
                const participants = await ChallengeParticipant.find({
                    challengeId: challenge._id,
                    inviteStatus: "accepted",
                }).sort({ "challengeBoardStats.totalCigarettesAvoided": -1 });

                const winnerId = participants[0]?.userId || null;

                // Use findByIdAndUpdate to avoid re-validating the stale doc
                await Challenge.findByIdAndUpdate(challenge._id, {
                    status: "completed",
                    winner: winnerId,
                });

                // Award XP and badges
                for (const p of participants) {
                    if (p.xpEarned > 0) continue; // skip already awarded

                    const isWinner = winnerId?.toString() === p.userId.toString();
                    const xp = isWinner ? challenge.xpReward : Math.floor(challenge.xpReward / 2);

                    p.xpEarned = xp;
                    await p.save();

                    const updatedProgress = await addXP(p.userId.toString(), xp);
                    await checkAndAssignBadge(p.userId.toString(), "completion", updatedProgress.challengesCompleted);
                    await checkAndAssignBadge(p.userId.toString(), "milestone", updatedProgress.level);
                }

                // Notify users
                const playerIds = participants.map((p) => p.userId.toString());
                const sendNotificationToUsers = require("./utils/sendNotification");
                await sendNotificationToUsers(
                    playerIds,
                    "Challenge Ended! 🏆",
                    `${challenge.title} has completed. Check your results!`,
                    { type: "challenge_completed", challengeId: challenge._id.toString() }
                );
                console.log(`Auto-completed challenge ${challenge._id}`);
            }
        } catch (error) {
            console.error("Challenge auto-complete error:", error);
        }
    }, 5 * 60 * 1000); // 5 minutes

    // Auto-activate / auto-complete competitions cron job (runs every 5 minutes)
    const Competition = require("./models/Competition");
    const sendNotificationToUsers = require("./utils/sendNotification");
    setInterval(async () => {
        try {
            const now = new Date();

            // 1) Auto-activate: pending competitions that are full AND startDate has arrived
            const toActivate = await Competition.find({
                status: "pending",
                startDate: { $lte: now },
                $expr: { $eq: [{ $size: "$players" }, "$numberOfPlayers"] },
            });

            for (const comp of toActivate) {
                comp.status = "active";
                await comp.save();

                const playerIds = comp.players.map((p) => p.user.toString());
                await sendNotificationToUsers(
                    playerIds,
                    "Competition Started! 🏆",
                    "Your competition is now active. Good luck!",
                    { type: "competition_active", competitionId: comp._id.toString() }
                );
                console.log(`Auto-activated competition ${comp._id}`);
            }

            // 2) Auto-complete: active competitions whose endDate has passed
            const toComplete = await Competition.find({
                status: "active",
                endDate: { $lte: now },
            });

            for (const comp of toComplete) {
                comp.status = "completed";
                await comp.save();

                const playerIds = comp.players.map((p) => p.user.toString());
                await sendNotificationToUsers(
                    playerIds,
                    "Competition Completed! 🎉",
                    "Your competition has ended. Check your results!",
                    { type: "competition_completed", competitionId: comp._id.toString() }
                );
                console.log(`Auto-completed competition ${comp._id}`);
            }
        } catch (error) {
            console.error("Competition cron error:", error);
        }
    }, 5 * 60 * 1000); // 5 minutes
});
