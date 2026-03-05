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

    // Auto-expire challenges cron job (runs every 5 minutes)
    const Challenges = require("./models/Challenges");
    setInterval(async () => {
        try {
            const result = await Challenges.updateMany(
                { status: "pending", dueAt: { $lte: new Date() } },
                { status: "expired" }
            );
            if (result.modifiedCount > 0) {
                console.log(`Auto-expired ${result.modifiedCount} challenges`);
            }
        } catch (error) {
            console.error("Auto-expire error:", error);
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
