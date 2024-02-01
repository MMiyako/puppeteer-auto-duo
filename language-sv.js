import puppeteer from "puppeteer-extra";
import Adblocker from "puppeteer-extra-plugin-adblocker";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import chalk from "chalk";
import fs from "fs";

const fsp = fs.promises;

(async () => {
    puppeteer.use(StealthPlugin());
    puppeteer.use(Adblocker({ blockTrackers: true }));

    const browser = await puppeteer.launch({
        headless: false,
        userDataDir: "user_data",
        args: ["--mute-audio", "--window-size=1000,1000", "--window-position=-5,0"],
        defaultViewport: null,
        // devtools: true,
        // slowMo: 100,
    });

    const page = await browser.newPage();

    // Params
    // normal, manual, practice, mistake, legendary

    let params = process.argv.slice(2);
    let modeUrl = "https://www.duolingo.com/lesson";

    if (params.length > 0 && params[0] == "manual") {
        await page.goto("https://www.duolingo.com/");
        return;
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

    await page.goto(modeUrl);

    let localStorage = await getLocalStorage(page);

    await sleep(1000);

    await checkSettings(page, modeUrl, localStorage);

    let session;

    while (!session) {
        await sleep(1000);
        page.reload();
        await sleep(1000);
        session = await getChallengesSession(page, modeUrl);
    }

    // Challenges
    let knownTypes = [
        "assist",
        "translate",
        "listenTap",
        "selectTranscription",
        "match",
        "select",
        "gapFill",
        "completeReverseTranslation",
        "listenComplete",
        "listenMatch",
        "listen",
        "name",
        "form",
        "speak",
        "listenSpeak",
        "partialReverseTranslate",
    ];

    let challenges = session.challenges;
    let harder = session.adaptiveChallenges;
    let hardpoint = false;

    // Replace type speak
    for (let i = 0; i < challenges.length; i++) {
        if (challenges[i].type == "speak" || challenges[i].type == "listenSpeak") {
            let replacementID = session.adaptiveInterleavedChallenges.speakOrListenReplacementIndices[i];
            if (replacementID !== null) {
                challenges[i] = session.adaptiveInterleavedChallenges.challenges[replacementID];
            }
        }
    }

    challenges.forEach((challenge, index) => {
        console.log(`${index.toString().padStart(2, "0")} - ${challenge.type}`);
    });

    if (harder) {
        console.log("----------------------------------------");

        harder.forEach((challenge, index) => {
            console.log(`${index.toString().padStart(2, "0")} - ${challenge.type} (Hard)`);
        });
    }

    for (let i = 0; i < challenges.length; i++) {
        console.log(`----------------------------------------`);
        console.log(`${i} - ${challenges[i].type}`);

        let nextButton = await page.waitForSelector('[data-test="player-next"]');

        await sleep(500);

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
            await sleep(500);
            // Fix (Node is detached from document)
            nextButton = await page.waitForSelector('[data-test="player-next"]');
            await nextButton.click();
            await sleep(500);
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

        // speak
        if (challenges[i].type == "speak" || challenges[i].type == "listenSpeak") {
            if (isNextButtonDisabled) {
                continue;
            }
        }

        // assist || characterIntro || characterSelect || selectPronunciation || select || selectTranscription || gapFill
        if (
            challenges[i].type == "assist" ||
            challenges[i].type == "characterIntro" ||
            challenges[i].type == "characterSelect" ||
            challenges[i].type == "selectPronunciation" ||
            challenges[i].type == "select" ||
            challenges[i].type == "selectTranscription" ||
            challenges[i].type == "gapFill" ||
            challenges[i].type == "form"
        ) {
            if (isNextButtonDisabled) {
                let el = await page.$$(`[data-test="challenge-choice"]`);
                await sleep(200);
                await el[challenges[i].correctIndex].click();
                await sleep(200);
                await nextButton.click();
                await sleep(200);
                await nextButton.click();
                await sleep(200);
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
                let fromTokens = await page.$$(`[data-test="${challenges[i].pairs[j].fromToken}-challenge-tap-token"]`);
                let learningTokens = await page.$$(
                    `[data-test="${challenges[i].pairs[j].learningToken}-challenge-tap-token"]`
                );

                // Fix multiple words error
                if (fromTokens.length <= 0) {
                    fromTokens = await page.$$(`text/${challenges[i].pairs[j].fromToken}`);
                }

                if (learningTokens.length <= 0) {
                    learningTokens = await page.$$(`text/${challenges[i].pairs[j].learningToken}`);
                }

                // Fix same words error
                if (fromTokens.length > 1) {
                    await fromTokens[0].click();
                    await sleep(200);
                    await fromTokens[1].click();
                    await sleep(200);
                } else {
                    await fromTokens[0].click();
                    await sleep(200);
                    await learningTokens[0].click();
                    await sleep(200);
                }
            }
            await nextButton.click();
            await sleep(200);
            await nextButton.click();
            await sleep(200);
        }

        // translate
        if (challenges[i].type == "translate" && isNextButtonDisabled) {
            if (toggleKeyboard) {
                // Textarea can be toggle
                if (toggleKeyboard == "USE KEYBOARD") {
                    await page.click("[data-test='player-toggle-keyboard']");
                    await page.waitForSelector("[data-test='challenge-translate-input']");
                }

                await page.type("[data-test='challenge-translate-input']", challenges[i].correctSolutions[0], {
                    delay: 2,
                });

                await nextButton.click();
                await sleep(200);
                await nextButton.click();
                await sleep(200);
            } else {
                let el = await page.$(`[data-test='challenge-translate-input']`);
                if (el) {
                    // Only textarea
                    await page.type("[data-test='challenge-translate-input']", challenges[i].correctSolutions[0], {
                        delay: 2,
                    });
                } else {
                    // Only word bank
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
                    await page.click("[data-test='player-toggle-keyboard']");
                    await page.waitForSelector("[data-test='challenge-translate-input']");
                }

                await page.type("[data-test='challenge-translate-input']", challenges[i].prompt, {
                    delay: 2,
                });

                await nextButton.click();
                await sleep(200);
                await nextButton.click();
                await sleep(200);
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

        // completeReverseTranslation
        if (challenges[i].type == "completeReverseTranslation" && isNextButtonDisabled) {
            if (toggleKeyboard) {
                // --- Type Event ---
                if (toggleKeyboard == "MAKE HARDER") {
                    await page.click("[data-test='player-toggle-keyboard']");
                    await page.waitForSelector("[data-test='challenge-translate-input']");
                }

                await page.type(
                    "[data-test='challenge-translate-input']",
                    challenges[i].challengeResponseTrackingProperties.best_solution,
                    {
                        delay: 2,
                    }
                );

                await nextButton.click();
                await sleep(200);
                await nextButton.click();
                await sleep(200);
            }
        }

        // partialReverseTranslate
        if (challenges[i].type == "partialReverseTranslate" && isNextButtonDisabled) {
            let answer = challenges[i].displayTokens.map((token) => {
                if (token.isBlank) {
                    return token.text;
                }
            });
            let parsedAnswer = answer.join("");

            await page.click("[contenteditable='true'] + span");

            await sleep(500);

            await page.type("[contenteditable='true']", parsedAnswer, {
                delay: 2,
            });

            await nextButton.click();
            await sleep(200);
            await nextButton.click();
            await sleep(200);
        }

        // listenComplete
        if (challenges[i].type == "listenComplete" && isNextButtonDisabled) {
            let answer = challenges[i].displayTokens.map((token) => {
                if (token.isBlank) {
                    return token.text;
                }
            });
            let parsedAnswer = answer.join("");

            await page.type("[data-test='challenge-text-input']", parsedAnswer, {
                delay: 2,
            });

            await nextButton.click();
            await sleep(200);
            await nextButton.click();
            await sleep(200);
        }

        // listenMatch
        if (challenges[i].type == "listenMatch" && isNextButtonDisabled) {
            for (let j = 0; j < challenges[i].pairs.length; j++) {
                await sleep(200);

                let el = await page.$$(`[data-test="${challenges[i].pairs[j].translation}-challenge-tap-token"]`);

                // Fix multiple words error
                if (el.length <= 0) {
                    let wordbank = await page.$(`text/${challenges[i].pairs[j].translation}`);
                    let wordbankclass = await page.evaluate(
                        (element) => element.parentElement.parentElement.getAttribute("data-test"),
                        wordbank
                    );

                    el = await page.$$(`[data-test="${wordbankclass}"]`);
                }

                await el[0].click();
                await sleep(200);
                await el[1].click();
                await sleep(200);
            }
            await nextButton.click();
            await sleep(200);
            await nextButton.click();
            await sleep(200);
        }

        // listen
        if (challenges[i].type == "listen" && isNextButtonDisabled) {
            await page.type("[data-test='challenge-translate-input']", challenges[i].prompt, {
                delay: 2,
            });

            await nextButton.click();
            await sleep(200);
            await nextButton.click();
            await sleep(200);
        }

        // name
        if (challenges[i].type == "name" && isNextButtonDisabled) {
            await page.type("[data-test='challenge-text-input']", challenges[i].correctSolutions[0], {
                delay: 2,
            });

            await nextButton.click();
            await sleep(200);
            await nextButton.click();
            await sleep(200);
        }

        // Hard Challenge Flash Page
        if (harderMessage) {
            console.log(`${i} - ${challenges[i].type} (Skip)`);
            hardpoint = true;
            await nextButton.click();
            await sleep(500);
            break;
        }

        console.log(`${i} - ${challenges[i].type} ✔️`);

        await sleep(500);
    }

    if (!harder || !hardpoint) {
        await finishing(page, localStorage);

        await browser.close();
        process.exit();
    }

    // Harder Challenges
    console.log(`----------------------------------------`);
    console.log(`Hard Challenges`);

    for (let i = 0; i < harder.length; i++) {
        console.log(`----------------------------------------`);
        console.log(`${i} - ${harder[i].type}`);

        let nextButton = await page.waitForSelector('[data-test="player-next"]');

        await sleep(500);

        let isNextButtonDisabled = await page.evaluate((el) => el.getAttribute("aria-disabled") === "true", nextButton);

        let toggleKeyboard = await page.evaluate(() => {
            let el = document.querySelector("[data-test='player-toggle-keyboard']");
            return el ? el.innerText : "";
        });

        if (harder[i].type == "translate" && isNextButtonDisabled) {
            if (toggleKeyboard == "USE KEYBOARD") {
                await page.click("[data-test='player-toggle-keyboard']");
                await page.waitForSelector("[data-test='challenge-translate-input']");
            }

            await page.type("[data-test='challenge-translate-input']", harder[i].correctSolutions[0], {
                delay: 2,
            });

            await nextButton.click();
            await sleep(200);
            await nextButton.click();
            await sleep(200);
        }

        console.log(`${i} - ${harder[i].type} ✔️`);

        await sleep(500);
    }

    await finishing(page, localStorage);

    await browser.close();
    process.exit();
})();

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms / 2));
}

async function getLocalStorage(page) {
    const localStorage = await page.evaluate(() => {
        return JSON.parse(window.localStorage.getItem("duo.state"));
    });

    return localStorage;
}

async function checkSettings(page, url, localStorage) {
    let currentCourse = localStorage.state.redux.user.currentCourseId;

    if (currentCourse != "DUOLINGO_SV_EN") {
        throw new Error("Wrong course: " + currentCourse);
    }

    let motivationMsg = localStorage.state.redux.browserSettings.coachEnabled;

    if (motivationMsg) {
        console.log("----------------------------------------");
        console.log("Changing settings...");

        await page.goto("https://www.duolingo.com/settings/account");

        await page.waitForSelector("#coachEnabled");
        await page.click("#coachEnabled + div");

        await page.click('[data-test="save-button"]');
        await sleep(5000);
        await page.goto(url);
    }

    console.log("----------------------------------------");
    console.log("Settings ✔️");
    console.log("----------------------------------------");
}

async function getChallengesSession(page, url) {
    console.log("Loading session...");
    console.log("----------------------------------------");

    // Navigate to the website
    await page.goto(url, { waitUntil: "domcontentloaded" });

    // Wait for the XHR response to be loaded
    const response = await page.waitForResponse((response) => {
        let session = response.url().endsWith("/sessions");
        return session;
    });

    // Extract the response data
    return await response.json();
}

async function readFile(file) {
    let fileData = await fsp.readFile(file, "utf8");
    let jsonData = JSON.parse(fileData);

    return jsonData;
}

async function writeFile(file, data) {
    await fsp.writeFile(file, JSON.stringify(data, null, 4));
}

async function getCourses(localStorage, data) {
    let currentPath = localStorage.state.redux.courses.DUOLINGO_SV_EN.pathSectioned[data.path];
    let currentUnit = currentPath.units[data.unit];
    let updateUnit = false;

    for (let i = 0; i < currentUnit.levels.length; i++) {
        if (currentUnit.levels[i].state == "active") {
            console.log(chalk.hex("#fce07e")(`Total Lessons: ${currentUnit.levels[i].totalSessions}`));
            console.log(chalk.hex("#fce07e")(`Current Lesson: ${currentUnit.levels[i].finishedSessions + 1}`));
            console.log(`----------------------------------------`);
            if (i + 1 < currentUnit.levels.length) {
                console.log(chalk.hex("#fce07e")(`Next Lesson Type: ${currentUnit.levels[i + 1].type}`));
                console.log(chalk.hex("#fce07e")(`Next Total Lessons: ${currentUnit.levels[i + 1].totalSessions}`));
            } else {
                let newUnit = currentPath.units[data.unit + 1];
                console.log(chalk.hex("#eb6060")(`*Next Unit Total Lessons: ${newUnit.levels[0].totalSessions}`));
                updateUnit = true;
            }
        }
    }

    return updateUnit;
}

async function finishing(page, localStorage) {
    console.log(`----------------------------------------`);
    console.log("Finishing...");

    let finished = await page.$("text/Review lesson");

    while (!finished) {
        await sleep(1000);
        finished = await page.$("text/Review lesson");
    }

    console.log(`----------------------------------------`);

    await sleep(1000);

    let data = await readFile("data.json");

    let updateUnit = await getCourses(localStorage, data);

    if (updateUnit) {
        data.unit += 1;
    }

    data.perfect_lessons += 1;
    await writeFile("data.json", data);
    console.log(`----------------------------------------`);
    console.log(chalk.hex("#52bdff")(`Perfect Lessons: ${data.perfect_lessons}`));
    console.log(`----------------------------------------`);
    process.stdout.write("\x07");
}
