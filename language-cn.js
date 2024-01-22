import puppeteer from "puppeteer-extra";
import Adblocker from "puppeteer-extra-plugin-adblocker";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

(async () => {
    puppeteer.use(StealthPlugin());
    puppeteer.use(Adblocker({ blockTrackers: true }));

    const browser = await puppeteer.launch({
        headless: false,
        userDataDir: "user_data",
        args: [
            "--mute-audio",
            // "--start-maximized",
        ],
        // devtools: true,
        // slowMo: 100,
    });

    const page = await browser.newPage();

    await page.setViewport({
        width: 1280,
        height: 720,
        deviceScaleFactor: 1,
    });

    page.setDefaultNavigationTimeout(0);

    await page.goto("https://www.duolingo.com/learn");
    await sleep(1500);

    // Params
    // normal, manual, delay, practice, mistake, legendary

    let params = process.argv.slice(2);
    let delay = 0;
    let modeUrl = "https://www.duolingo.com/lesson";

    if (params.length > 0 && params[0] == "manual") {
        await page.goto("https://www.duolingo.com/");
        return;
    }

    if (params.length > 0 && params[0] == "delay") {
        delay = params[1];
    }

    if (params.length > 0 && params[0] == "practice") {
        modeUrl = "https://www.duolingo.com/practice";
    }

    if (params.length > 0 && params[0] == "mistake") {
        modeUrl = "https://www.duolingo.com/mistakes-review";
    }

    if (params.length > 0 && params[0] == "legendary") {
        if (!params[1] || !params[2]) {
            throw new Error("Missing parameter(s)");
        }

        modeUrl = `https://www.duolingo.com/lesson/unit/${params[1]}/legendary/${params[2]}`;
    }

    let session;

    await page.goto(modeUrl);

    // Check & Set the correct settings
    await checkSettings(page, modeUrl);

    while (!session) {
        page.reload();
        await sleep(500);
        session = await getChallengesSession(page, modeUrl);
    }

    // Challenges
    let knownTypes = [
        "assist",
        "translate",
        "listenTap",
        "characterMatch",
        "characterIntro",
        "characterSelect",
        "selectPronunciation",
        "match",
        "select",
    ];

    let challenges = session.challenges;
    let harder = session.adaptiveChallenges;
    let hardpoint = false;

    console.log("Questions:\n");

    challenges.forEach((challenge, index) => {
        console.log(`${index.toString().padStart(2, "0")} - ${challenge.type}`);
    });

    if (harder) {
        console.log("----------------------------------------");

        harder.forEach((challenge, index) => {
            console.log(`${index.toString().padStart(2, "0")} - ${challenge.type}`);
        });
    }

    for (let i = 0; i < challenges.length; i++) {
        console.log(`----------------------------------------`);
        console.log(`${i} - ${challenges[i].type}`);

        let nextButton = await page.waitForSelector('[data-test="player-next"]');

        await sleep(1500);
        await sleep(delay);

        let isNextButtonDisabled = await page.evaluate((el) => el.getAttribute("aria-disabled") === "true", nextButton);
        let nextButtonText = await page.evaluate((el) => el.textContent.toLowerCase(), nextButton);

        let harderMessage = await page.$("text/Great work! Let's make this a bit harder...");
        let mistakeMode = await page.$("text/Let’s get started! You’ll review");
        let legendaryMode = await page.$("text/to reach Legendary");
        let legendaryMessage = await page.$("text/for your hard work so far");

        // Start The Challenge
        if (
            nextButtonText.includes("start challenge") ||
            nextButtonText.includes("start lesson") ||
            mistakeMode ||
            legendaryMode ||
            legendaryMessage
        ) {
            await nextButton.click();
            isNextButtonDisabled = true;
            await sleep(1000);
            // Fix (Node is detached from document)
            nextButton = await page.waitForSelector('[data-test="player-next"]');
            await nextButton.click();
            await sleep(1000);
        }

        // * Have to select the toggle button only after the challenge started
        let toggleKeyboard = await page.evaluate(() => {
            let el = document.querySelector("[data-test='player-toggle-keyboard']");
            return el ? el.innerText : "";
        });

        // Check All Known Challenges Types
        if (!knownTypes.includes(challenges[i].type)) {
            throw new Error("Unknow Type: " + challenges[i].type);
        }

        // assist || characterIntro || characterSelect || selectPronunciation || select
        if (
            challenges[i].type == "assist" ||
            challenges[i].type == "characterIntro" ||
            challenges[i].type == "characterSelect" ||
            challenges[i].type == "selectPronunciation" ||
            challenges[i].type == "select"
        ) {
            if (isNextButtonDisabled) {
                let el = await page.$$(`[data-test="challenge-choice"]`);
                await sleep(200);
                await el[challenges[i].correctIndex].click();
                await sleep(200);
                await nextButton.click();
                await sleep(500);
                await nextButton.click();
                await sleep(500);
            }
        }

        // characterMatch
        if (challenges[i].type == "characterMatch" && isNextButtonDisabled) {
            for (let j = 0; j < challenges[i].pairs.length; j++) {
                await sleep(200);
                let transliteration = await page.$(
                    `[data-test="${challenges[i].pairs[j].transliteration}-challenge-tap-token"]`
                );
                let character = await page.$(`[data-test="${challenges[i].pairs[j].character}-challenge-tap-token"]`);
                await transliteration.click();
                await sleep(200);
                await character.click();
                await sleep(200);
            }
            await nextButton.click();
            await sleep(200);
            await nextButton.click();
            await sleep(200);
        }

        // match
        if (challenges[i].type == "match" && isNextButtonDisabled) {
            for (let j = 0; j < challenges[i].pairs.length; j++) {
                await sleep(200);
                let fromToken = await page.$(`[data-test="${challenges[i].pairs[j].fromToken}-challenge-tap-token"]`);
                let learningToken = await page.$(
                    `[data-test="${challenges[i].pairs[j].learningToken}-challenge-tap-token"]`
                );

                // Fix multiple words error
                if (!fromToken) {
                    fromToken = await page.$(`text/${challenges[i].pairs[j].fromToken}`);
                }

                if (!learningToken) {
                    learningToken = await page.$(`text/${challenges[i].pairs[j].learningToken}`);
                }

                await fromToken.click();
                await sleep(200);
                await learningToken.click();
                await sleep(200);
            }
            await nextButton.click();
            await sleep(200);
            await nextButton.click();
            await sleep(200);
        }

        // translate
        if (challenges[i].type == "translate" && isNextButtonDisabled) {
            if (toggleKeyboard) {
                // --- Type Event ---
                if (toggleKeyboard == "USE KEYBOARD") {
                    console.log("### TOGGLE KEYBOARD ###");
                    await page.click("[data-test='player-toggle-keyboard']");
                    await page.waitForSelector("[data-test='challenge-translate-input']");
                }

                await page.type("[data-test='challenge-translate-input']", challenges[i].correctSolutions[0], {
                    delay: 10,
                });

                await nextButton.click();
                await sleep(500);
                await nextButton.click();
                await sleep(500);
            } else {
                // --- Click Event ---
                for (let j = 0; j < challenges[i].correctTokens.length; j++) {
                    await sleep(200);

                    let el = await page.$$(
                        `[data-test="word-bank"] [data-test="${challenges[i].correctTokens[j]}-challenge-tap-token"]`
                    );

                    if (el && el.length === 1) {
                        await el[0].click();
                    } else if (el && el.length > 1) {
                        for (let index = 0; index < el.length; index++) {
                            let checked = await page.evaluate(
                                (e) => e.getAttribute("aria-disabled") === "true",
                                el[index]
                            );
                            if (!checked) {
                                await el[index].click();
                                break;
                            }
                        }
                    }
                }
                await nextButton.click();
                await sleep(200);
                await nextButton.click();
                await sleep(200);
            }
        }

        // listenTap
        if (challenges[i].type == "listenTap" && isNextButtonDisabled) {
            if (toggleKeyboard) {
                // --- Type Event ---
                if (toggleKeyboard == "USE KEYBOARD") {
                    console.log("### TOGGLE KEYBOARD ###");
                    await page.click("[data-test='player-toggle-keyboard']");
                    await page.waitForSelector("[data-test='challenge-translate-input']");
                }

                await page.type("[data-test='challenge-translate-input']", challenges[i].prompt, {
                    delay: 10,
                });

                await nextButton.click();
                await sleep(500);
                await nextButton.click();
                await sleep(500);
            } else {
                // --- Click Event ---
                for (let j = 0; j < challenges[i].correctTokens.length; j++) {
                    await sleep(200);

                    let el = await page.$$(
                        `[data-test="word-bank"] [data-test="${challenges[i].correctTokens[j]}-challenge-tap-token"]`
                    );

                    if (el && el.length === 1) {
                        await el[0].click();
                    } else if (el && el.length > 1) {
                        for (let index = 0; index < el.length; index++) {
                            let checked = await page.evaluate(
                                (e) => e.getAttribute("aria-disabled") === "true",
                                el[index]
                            );
                            if (!checked) {
                                await el[index].click();
                                break;
                            }
                        }
                    }
                }
                await nextButton.click();
                await sleep(200);
                await nextButton.click();
                await sleep(200);
            }
        }

        // Hard Challenge Flash Page
        if (harderMessage) {
            console.log(`${i} - ${challenges[i].type} (Skip)`);
            hardpoint = true;
            await nextButton.click();
            await sleep(500);
            break;
        }

        console.log(`${i} - ${challenges[i].type} \u2714`);

        await sleep(1000);
        await sleep(delay);
    }

    // Harder Challenges
    if (!harder || !hardpoint) {
        return;
    }

    console.log(`----------------------------------------`);
    console.log(`Hard Challenges`);

    for (let i = 0; i < harder.length; i++) {
        console.log(`----------------------------------------`);
        console.log(`${i} - ${harder[i].type}`);

        let nextButton = await page.waitForSelector('[data-test="player-next"]');

        await sleep(1500);
        await sleep(delay);

        let isNextButtonDisabled = await page.evaluate((el) => el.getAttribute("aria-disabled") === "true", nextButton);

        let toggleKeyboard = await page.evaluate(() => {
            let el = document.querySelector("[data-test='player-toggle-keyboard']");
            return el ? el.innerText : "";
        });

        if (harder[i].type == "translate" && isNextButtonDisabled) {
            if (toggleKeyboard == "USE KEYBOARD") {
                console.log("### TOGGLE KEYBOARD ###");
                await page.click("[data-test='player-toggle-keyboard']");
                await page.waitForSelector("[data-test='challenge-translate-input']");
            }

            await page.type("[data-test='challenge-translate-input']", harder[i].correctSolutions[0], {
                delay: 10,
            });

            await nextButton.click();
            await sleep(500);
            await nextButton.click();
            await sleep(500);
        }

        console.log(`${i} - ${harder[i].type} \u2714`);

        await sleep(1000);
        await sleep(delay);
    }
})();

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function checkSettings(page, url) {
    // Get the localStorage value
    const localStorage = await page.evaluate(() => {
        return JSON.parse(window.localStorage.getItem("duo.state"));
    });

    // Check Current Language
    let currentCourse = localStorage.state.redux.user.currentCourseId;

    if (currentCourse != "DUOLINGO_ZH-CN_EN") {
        throw new Error("Wrong course: " + currentCourse);
    }

    // Disable animations, motivations, pronunciation
    let disableAnimations = localStorage.state.redux.browserSettings.prefersReducedMotion;
    let motivationMsg = localStorage.state.redux.browserSettings.coachEnabled;
    let showPronunciation = localStorage.state.redux.browserSettings.transliterationsSettings["zh<en"].enabled;

    if (!disableAnimations || motivationMsg || showPronunciation) {
        console.log("----------------------------------------");
        console.log("Changing settings...");

        await page.goto("https://www.duolingo.com/settings/account");

        const animation = await page.waitForSelector("#prefersReducedMotion");
        const motivation = await page.waitForSelector("#coachEnabled");

        if (!disableAnimations) {
            await animation.evaluate((a) => a.click());
        }

        if (motivationMsg) {
            await motivation.evaluate((a) => a.click());
        }

        await page.click('[data-test="save-button"]');
        await sleep(2000);

        await page.goto("https://www.duolingo.com/settings/courses");

        const showPronunciation = await page.waitForSelector("#showPronunciation");

        if (showPronunciation) {
            await showPronunciation.evaluate((a) => a.click());
        }

        await page.click('[data-test="save-button"]');
        await sleep(2000);

        await page.goto(url);
    }

    console.log("----------------------------------------");
    console.log("Settings \u2714");
    console.log("----------------------------------------");
}

async function getChallengesSession(page, url) {
    console.log("Loading session...");
    console.log("----------------------------------------");

    // Navigate to the website
    await page.goto(url);

    // Wait for the XHR response to be loaded
    const response = await page.waitForResponse((response) => {
        let session = response.url().endsWith("/sessions");
        return session;
    });

    // Extract the response data
    return await response.json();
}
