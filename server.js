
require("dotenv").config();

const express    = require("express");
const mongoose   = require("mongoose");
const DailyBoard = require("./models/DailyBoard");
const { startCronJobs } = require("./crons/index");

// ─── Route Imports ────────────────────────────────────────────────────────────

const authRoutes          = require("./routes/authRoutes");
const postRoutes          = require("./routes/postRoutes");
const blogRoutes          = require("./routes/blogRoutes");
const commentRoutes       = require("./routes/commentRoutes");
const likeRoutes          = require("./routes/likeRoutes");
const taskRoutes          = require("./routes/taskRoutes");
const categoryRoutes      = require("./routes/categoryRoutes");
const milestoneRoutes     = require("./routes/milestoneRoutes");
const faqRoutes           = require("./routes/faqRoutes");
const feedbackRoutes      = require("./routes/feedbackRoutes");
const chatRoutes          = require("./routes/chatRoutes");
const messageRoutes       = require("./routes/messageRoutes");
const contactRoutes       = require("./routes/contactRoutes");
const motivationaltipRoutes = require("./routes/motivationaltipRoutes");
const quickWinRoutes      = require("./routes/quickWinRoutes");
const healthBodyRoutes    = require("./routes/healthBodyRoutes");
const notificationRoutes  = require("./routes/notificationRoutes");
const TemplateRoutes      = require("./routes/TemplateRoutes");
const challengesRoutes    = require("./routes/challengesRoutes");
const boardRoutes         = require("./routes/boardRoutes");
const competitionRoutes   = require("./routes/competitionRoutes");
const badgeRoutes         = require("./routes/badgeRoutes");
const postHideRoutes      = require("./routes/postHideRoutes");
const postReportRoutes    = require("./routes/postReportRoutes");

// ─── App Initialisation ───────────────────────────────────────────────────────

const app  = express();
const PORT = process.env.PORT || 5000;

// ─── Global Middleware ────────────────────────────────────────────────────────

app.use(express.json());

// ─── Routes ───────────────────────────────────────────────────────────────────

app.get("/", (_req, res) => res.send("Hello, Node and MongoDB!"));

app.use("/auth",                  authRoutes);
app.use("/posts",                 postRoutes);
app.use("/blogs",                 blogRoutes);
app.use("/comments",              commentRoutes);
app.use("/likes",                 likeRoutes);
app.use("/tasks",                 taskRoutes);
app.use("/categories",            categoryRoutes);
app.use("/milestones",            milestoneRoutes);
app.use("/faqs",                  faqRoutes);
app.use("/feedback",              feedbackRoutes);
app.use("/chats",                 chatRoutes);
app.use("/messages",              messageRoutes);
app.use("/contacts",              contactRoutes);
app.use("/motivationaltips",      motivationaltipRoutes);
app.use("/quick-wins",            quickWinRoutes);
app.use("/health-body",           healthBodyRoutes);
app.use("/notifications",         notificationRoutes);
app.use("/challenge-templates",   TemplateRoutes);
app.use("/challenge-assignments", challengesRoutes);
app.use("/boards",                boardRoutes);
app.use("/competitions",          competitionRoutes);
app.use("/badges",                badgeRoutes);
app.use("/post-hides",            postHideRoutes);
app.use("/post-reports",          postReportRoutes);

// ─── Database Connection ──────────────────────────────────────────────────────

async function connectDatabase() {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("[DB] Connected to MongoDB successfully");

    // Keep DailyBoard indexes aligned with the schema to avoid stale unique-index conflicts.
    await DailyBoard.syncIndexes();
    console.log("[DB] DailyBoard indexes synced");
}

// ─── Server Bootstrap ─────────────────────────────────────────────────────────

async function bootstrap() {
    try {
        await connectDatabase();

        app.listen(PORT, () => {
            console.log(`[Server] Server Running on port ${PORT}`);
            startCronJobs();
        });
    } catch (error) {
        console.error("[Server] Failed to start:", error);
        process.exit(1);
    }
}

bootstrap();
