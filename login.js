import puppeteer from "puppeteer-extra";
import Adblocker from "puppeteer-extra-plugin-adblocker";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import "dotenv/config";

(async () => {
    puppeteer.use(StealthPlugin());
    puppeteer.use(Adblocker({ blockTrackers: true }));

    const browser = await puppeteer.launch({
        headless: false,
        args: ["--start-maximized"],
        userDataDir: "user_data",
    });

    const page = await browser.newPage();
    await page.bringToFront();

    await page.setViewport({
        width: 1440,
        height: 900,
        deviceScaleFactor: 1,
    });

    page.setDefaultNavigationTimeout(0);

    await page.goto("https://www.duolingo.com/");
    const toLogin = await page.$('[data-test="have-account"]');

    if (!toLogin) {
        console.log("You are already logged in.");
        await browser.close();
        process.exit();
    }

    await toLogin.click();

    await page.type('[data-test="email-input"]', process.env["EMAIL"]);
    await page.type('[data-test="password-input"]', process.env["PASSWORD"]);
    await page.click('[data-test="register-button"]');

    await page.waitForNavigation();

    console.log("Login successfully");

    await browser.close();
})();
