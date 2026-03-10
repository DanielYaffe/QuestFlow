import { config } from "config/config";
import initApp from "./server";

initApp().then((app) => {
    app.listen(config.PORT, () => {
        console.log(`Example app listening and running on http://localhost:${config.PORT}`);
    });
});
