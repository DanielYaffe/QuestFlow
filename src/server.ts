import express, { Express } from "express";
import dotenv from "dotenv";
import mongoose from "mongoose";
import bodyParser from "body-parser";
import { config } from "./config/config";
import commentsRouter from "./routes/commentRoute";
import userRouter from "./routes/userRoute";
import postRouter from "./routes/postRoute";
import authRouter from "./routes/authRoute";
import questlineRouter from "./routes/questlineRoute";
import questGenerationRouter from "./routes/questGenerationRoute";
import exportTemplateRouter from "./routes/exportTemplateRoute";
import spriteRouter from "./routes/spriteRoute";
import questStyleRouter from "./routes/questStyleRoute";
import { seedQuestStyles } from "./models/questStyleModel";
import cors from "cors";
import "./config/passport";
import { authenticate } from "./middlewares/authMiddleware";
import { swaggerUi, swaggerSpec } from "./swagger";

dotenv.config();

const app = express();

app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  explorer: true,
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'Shoval & Daniel Posts & Comments API Documentation'
}));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors())

app.use('/auth', authRouter);
app.use(authenticate);
app.use('/comments', commentsRouter);
app.use('/users', userRouter);
app.use('/posts', postRouter);
app.use('/questlines', questlineRouter);
app.use('/quests', questGenerationRouter);
app.use('/export-templates', exportTemplateRouter);
app.use('/sprites', spriteRouter);
app.use('/quest-styles', questStyleRouter);

const db = mongoose.connection;
db.on("error", (error) => console.error(error));
db.once("open", () => console.log("Connected to Database"));

const initApp = () => {
    return new Promise<Express>((resolve, reject) => {

        if (!config.DATABASE_URL) {
            reject("DATABASE_URL is not defined in .env file");
        } else {
            mongoose
                .connect(config.DATABASE_URL)
                .then(() => {
                    seedQuestStyles().catch((err) => console.error('[seed] questStyles failed:', err));
                    resolve(app);
                })
                .catch((error) => {
                    reject(error);
                });
        }
    });
};

export default initApp;
