// Relative, not a baseUrl import: tsc does not rewrite non-relative specifiers,
// so "config/config" survives into dist and Node then looks for it in
// node_modules. This is the entrypoint, so it fails before anything else runs.
import { config } from "./config/config";
import initApp from "./server";

initApp().then((app) => {
    const server = app.listen(config.PORT);

    server.on("listening", () => {
        const addr = server.address() as { port: number };
        console.log(`Server running on http://localhost:${addr.port}`);
    });

    server.on("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "EADDRINUSE") {
            console.error(`Port ${config.PORT} is already in use`);
        } else {
            console.error(err);
        }
        process.exit(1);
    });
});
