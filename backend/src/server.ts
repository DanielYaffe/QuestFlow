import express, { Express } from "express";
import dotenv from "dotenv";
import mongoose from "mongoose";
import bodyParser from "body-parser";
import { config } from "./config/config";
import authRouter from "./routes/authRoute";
import projectRouter from "./routes/projectRoute";
import characterRouter from "./routes/characterRoute";
import itemRouter from "./routes/itemRoute";
import questlineRouter from "./routes/questlineRoute";
import questGenerationRouter from "./routes/questGenerationRoute";
import spriteRouter from "./routes/spriteRoute";
import questStyleRouter from "./routes/questStyleRoute";
import nodeVariantConfigRouter from "./routes/nodeVariantConfigRoute";
import jobRouter from "./routes/jobRoute";
import stylesRouter from "./routes/stylesRoute";
import userSettingsRouter from "./routes/userSettingsRoute";
import exportTemplateRouter from "./routes/exportTemplateRoute";
import gameRouter from "./routes/gameRoute";
import { seedQuestStyles } from "./models/questStyleModel";
import { seedBaseVariants } from "./models/nodeVariantConfigModel";
import { seedThemes } from "./models/seedThemes";
import { seedBuiltInExportTemplates } from "./models/exportTemplateModel";
import { ensureDefaultProjects } from "./controllers/projectController";
import { migrateEmbeddedRewardsToItems } from "./services/itemService";
import cors from "cors";
import "./config/passport";
import { authenticate } from "./middlewares/authMiddleware";
import { swaggerUi, swaggerSpec } from "./swagger";

dotenv.config();

const app = express();

app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  explorer: true,
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'QuestFlow API Documentation'
}));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors())

app.use('/auth', authRouter);
app.use(authenticate);
app.use('/projects', projectRouter);
app.use('/characters', characterRouter);
app.use('/items', itemRouter);
app.use('/questlines', questlineRouter);
app.use('/quests', questGenerationRouter);
app.use('/sprites', spriteRouter);
app.use('/quest-styles', questStyleRouter);
app.use('/variant-configs', nodeVariantConfigRouter);
app.use('/jobs', jobRouter);
app.use('/styles', stylesRouter);
app.use('/users', userSettingsRouter);
app.use('/export-templates', exportTemplateRouter);
app.use('/games', gameRouter);

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
                    if (process.env.NODE_ENV === 'test' && !mongoose.connection.name.toLowerCase().includes('test')) {
                        const dbName = mongoose.connection.name;
                        return mongoose.connection.close().then(() => {
                            throw new Error(`Refusing to run tests against non-test database "${dbName}"`);
                        });
                    }
                    if (process.env.NODE_ENV !== 'test') {
                        seedQuestStyles().catch((err) => console.error('[seed] questStyles failed:', err));
                        seedBaseVariants().catch((err) => console.error('[seed] baseVariants failed:', err));
                        seedThemes().catch((err) => console.error('[seed] themes failed:', err));
                        seedBuiltInExportTemplates().catch((err) => console.error('[seed] exportTemplates failed:', err));
                        ensureDefaultProjects().catch((err) => console.error('[seed] defaultProjects failed:', err));
                        migrateEmbeddedRewardsToItems().catch((err) => console.error('[migrate] rewards→items failed:', err));
                    }
                    resolve(app);
                })
                .catch((error) => {
                    reject(error);
                });
        }
    });
};

export default initApp;
