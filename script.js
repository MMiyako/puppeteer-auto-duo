import { spawnSync } from "child_process";
import chalk from "chalk";

let params = process.argv.slice(2);

// Example: node script sv 5
for (let index = 1; index <= params[1]; index++) {
    spawnSync("node", [`language-${params[0]}.js`], { stdio: "inherit" });
    console.log(chalk.hex("#16da51")(`Total Script Run Time: ${params[1]}`));
    console.log(chalk.hex("#16da51")(`Current Script Run Time: ${index}`));
    console.log(`----------------------------------------`);
}
