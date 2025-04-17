const chalk = require('chalk');
const os = require('os');
const fs = require('fs');
const crc32 = require('crc/crc32');
const wifi = require('node-wifi');
const uuid = require('uuid-v4');
const Fuse = require('fuse.js');
const zlib = require('zlib');

if (!fs.existsSync("./archive")) fs.mkdirSync("./archive");

const hideCursor = require("hide-terminal-cursor");
const showCursor = require("show-terminal-cursor");

hideCursor();

if (!fs.existsSync("db.json")) fs.writeFileSync("db.json", "{\"date\": \"" + new Date().toISOString() + "\",\"known\": {},\"tags\": []}");

let version = "0.2.6";

let run = true;
let currentText = "";
let netListSize = Math.round((process.stdout.columns - 51) / 2.5);
let results = [];

let switcher = false;

process.stdout.cursorTo(process.stdout.columns - 4, 1);
process.stdout.write(chalk.bgGreen("  "));

function getText() {
    if (!list) {
        return "";
    } else {
        return list.networks.map(i => i.id + ":" + i.quality).join("|");
    }
}

process.on('uncaughtException', (error) => {
    run = false;

    process.stdout.cursorTo(process.stdout.columns - 4, 1);
    process.stdout.write(chalk.bgRed("  "));

    process.stdout.cursorTo(54, 5);
    process.stdout.write(chalk.red("Error -6 (JavaScript runtime error, press Ctrl+C to abort)") + " ".repeat(process.stdout.columns - 54 - 58));

    process.stdin.on('keypress', function (letter, key) {
        if (key && key.ctrl && key.name === 'c') {
            showCursor();
            console.clear();
            console.error(error);
            process.exit(2);
        }
    });
});

process.on('unhandledRejection', (error) => {
    run = false;

    process.stdout.cursorTo(process.stdout.columns - 4, 1);
    process.stdout.write(chalk.bgRed("  "));

    process.stdout.cursorTo(54, 5);
    process.stdout.write(chalk.red("Error -6 (JavaScript runtime error, press Ctrl+C to abort)") + " ".repeat(process.stdout.columns - 54 - 58));

    process.stdin.on('keypress', function (letter, key) {
        if (key && key.ctrl && key.name === 'c') {
            showCursor();
            console.clear();
            console.error(error);
            process.exit(2);
        }
    });
})

function listen() {
    const readline = require('readline');
    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);

    process.stdin.on('keypress', function (letter, key) {
        if (run) {
            if (key && key.ctrl && key.name === 'c') {
                showCursor();
                console.clear();
                process.exit();
            } else if (key && key.name === "return") {
                run = false;
                showCursor();

                process.stdout.cursorTo(process.stdout.columns - 4, 1);
                process.stdout.write(chalk.bgYellow("  "));

                process.stdout.cursorTo(0, process.stdout.rows - 1);
                process.stdout.write(chalk.bgYellow(" ".repeat(process.stdout.columns - 1)));
                process.stdout.cursorTo(0, process.stdout.rows - 1);
                process.stdout.write(chalk.bgYellow.white("Enter new tag name: "));
                currentText = "";
            }
        } else {
            if (key && key.ctrl && key.name === 'c' || key && key.name === "escape") {
                hideCursor();

                process.stdout.cursorTo(process.stdout.columns - 4, 1);
                process.stdout.write(chalk.bgGreen("  "));

                process.stdout.cursorTo(0, process.stdout.rows - 2);
                process.stdout.write(" ".repeat(50) + "┃" + " ".repeat(process.stdout.columns - 51));
                process.stdout.write(" ".repeat(50) + "┃" + " ".repeat(process.stdout.columns - 51));
                run = true;
            } else {
                if (key.name === "return") {
                    hideCursor();
                    if (currentText.trim() !== "" && list) {
                        let id = uuid();

                        let tag = {
                            id,
                            name: currentText,
                            text: getText(),
                            beacons: list.networks.map(i => { return {id: i.id, quality: i.quality}; })
                        }
                        db.tags.push(tag);

                        for (let network of list.networks) {
                            if (!db.known[network.id]) db.known[network.id] = [];
                            db.known[network.id].push(id);
                        }

                        db.date = new Date().toISOString();
                        fs.writeFileSync("./db.json", JSON.stringify(db));
                        archive();
                    }

                    process.stdout.cursorTo(process.stdout.columns - 4, 1);
                    process.stdout.write(chalk.bgGreen("  "));

                    process.stdout.cursorTo(0, process.stdout.rows - 2);
                    process.stdout.write(" ".repeat(50) + "┃" + " ".repeat(process.stdout.columns - 51));
                    process.stdout.write(" ".repeat(50) + "┃" + " ".repeat(process.stdout.columns - 51));
                    run = true;
                } else if (key.name === "backspace" && currentText.length > 0) {
                    currentText = currentText.substring(0, currentText.length - 1);
                    process.stdout.moveCursor(-1, 0);
                    process.stdout.write(chalk.bgYellow(" "));
                    process.stdout.moveCursor(-1, 0);
                } else if (key.sequence.match(/^[a-zA-Z-_ .()!?:/=+*éèàÉÈÀÊËëêùô&'"°\[\]{}\d]*$/g)) {
                    currentText += key.sequence;
                    process.stdout.write(chalk.bgYellow(key.sequence));
                }
            }
        }
    });
}

listen();

let known = [];

const db = require('./db.json');
let list = null;

function archive() {
    fs.writeFileSync("./archive/" + new Date().getTime() + ".osal", zlib.deflateRawSync(Buffer.from(JSON.stringify(db))));
}

archive();

wifi.init({
    iface: null
});


console.clear();

function setInfo(pos, text, ignoreOverflow) {
    process.stdout.cursorTo(24, 7 + pos);

    if (text.length > 24) {
        if (ignoreOverflow) {
            process.stdout.write(text);
        } else {
            process.stdout.write(text.substring(0, 23) + "…" + "  ");
        }
    } else {
        process.stdout.write(text + " ".repeat(26 - text.length));
    }
}

function refresh() {
    console.clear();

    let name = "On-Site Accurate Location (OSAL)";

    process.stdout.write(chalk.bgBlue.whiteBright(" ".repeat(process.stdout.columns) + "\n"));
    process.stdout.write(chalk.bgBlue.whiteBright("  " + name + " ".repeat(process.stdout.columns - name.length - 2)) + "\n");
    process.stdout.write(chalk.bgBlue.whiteBright(" ".repeat(process.stdout.columns) + "\n"));
    process.stdout.write("━".repeat(50) + "┳" + "━".repeat(process.stdout.columns - 51))

    console.log(" ".repeat(50) + "┃")
    console.log(" ".repeat(50) + "┃")
    console.log(" ".repeat(50) + "┃")
    console.log(" ".repeat(50) + "┣" + "━".repeat(netListSize) + "┳" + "━".repeat(process.stdout.columns - Math.round((process.stdout.columns - 51) / 2.5) - 52))

    for (let i = 0; i < 23; i++) {
        process.stdout.cursorTo(50, i + 8);
        process.stdout.write("┃");
    }

    process.stdout.cursorTo(50, 31);
    process.stdout.write("┫");

    for (let i = 0; i < process.stdout.rows - 29; i++) {
        process.stdout.cursorTo(50, i + 32);
        process.stdout.write("┃");
    }

    process.stdout.cursorTo(0, 31);
    process.stdout.write("━".repeat(50));

    process.stdout.cursorTo(0, 33);
    console.log(chalk.cyanBright.bold("  Tags in Database") + "\n");

    process.stdout.cursorTo(0, 5);

    console.log(chalk.cyanBright.bold("  Connection Information") + "\n");
    console.log(chalk.yellowBright("    Connection quality:"));
    console.log(chalk.yellowBright("         Beacons found:"));
    console.log(chalk.yellowBright(" Session known beacons:"));
    console.log(chalk.yellowBright("          Signal range:"));
    console.log(chalk.yellowBright("        Next update in:\n"));

    console.log(chalk.cyanBright.bold("  Database Information") + "\n");
    console.log(chalk.yellowBright("   DB and archive size:"));
    console.log(chalk.yellowBright("   Beacons in database:"));
    console.log(chalk.yellowBright("      Tags in database:"));
    console.log(chalk.yellowBright("            Last saved:"));
    console.log(chalk.yellowBright("   Database rev. CRC32:\n"));

    console.log(chalk.cyanBright.bold("  System Information") + "\n");
    console.log(chalk.yellowBright("       Node.js version:"));
    console.log(chalk.yellowBright("             V8 engine:"));
    console.log(chalk.yellowBright("        Kernel version:"));
    console.log(chalk.yellowBright("        NetworkManager:"));
    console.log(chalk.yellowBright("           Running for:"));
    console.log(chalk.yellowBright("          Memory usage:"));

    process.stdout.cursorTo(process.stdout.columns, process.stdout.rows)
}

function formatSize(size, integer) {
    if (size > 1024) {
        if (size > 1024**2) {
            if (size > 1024**3) {
                return (size / 1024**3).toFixed(integer ? 0 : 2) + " GiB";
            } else {
                return (size / 1024**2).toFixed(integer ? 0 : 2) + " MiB";
            }
        } else {
            return (size / 1024).toFixed(integer ? 0 : 2) + " KiB";
        }
    } else {
        return Math.round(size) + " bytes";
    }
}

function formatTime(time) {
    if (time > 60) {
        if (time > 3600) {
            return Math.floor(process.uptime() / 3600) + " minute" + (Math.floor(process.uptime() / 3600) > 1 ? "s" : "");
        } else {
            return Math.floor(process.uptime() / 60) + " minute" + (Math.floor(process.uptime() / 60) > 1 ? "s" : "");
        }
    } else {
        return Math.floor(process.uptime()) + " second" + (Math.floor(process.uptime()) > 1 ? "s" : "");
    }
}

function timeAgo(time) {
    if (!isNaN(parseInt(time))) {
        time = new Date(time).getTime();
    }

    let periods = ["second", "minute", "hour", "day", "week", "month", "year", "age"];

    let lengths = ["60", "60", "24", "7", "4.35", "12", "100"];

    let now = new Date().getTime();

    let difference = Math.round((now - time) / 1000);
    let tense;
    let period;

    if (difference <= 10 && difference >= 0) {
        return "now";
    } else if (difference > 0) {
        tense = "ago";
    } else {
        tense = "later";
    }

    let j;

    for (j = 0; difference >= lengths[j] && j < lengths.length - 1; j++) {
        difference /= lengths[j];
    }

    difference = Math.round(difference);

    period = periods[j];

    return `${difference} ${period}${difference > 1 ? "s" : ""} ${tense}`;
}

function progressBar(value, max, size) {
    let percentage = value / max;

    if (percentage > 1) percentage = 1;

    if (percentage > .85) {
        return chalk.bgWhite.red("█".repeat(size * percentage - 1 > 0 ? size * percentage - 1 : 0) + " ".repeat(size - (size * percentage)));
    } else if (percentage > .7) {
        return chalk.bgWhite.yellow("█".repeat(size * percentage - 1 > 0 ? size * percentage - 1 : 0) + " ".repeat(size - (size * percentage)));
    } else {
        return chalk.bgWhite.white("█".repeat(size * percentage - 1 > 0 ? size * percentage - 1 : 0) + " ".repeat(size - (size * percentage)));
    }
}

function connectionQuality() {
    if (list.networks.length === 0) {
        return "-";
    } else if (list.networks.length < 3) {
        return chalk.bgRed.white("Insufficient") + "      ";
    } else if (list.networks.length < 6) {
        return chalk.bgYellow.white("Fair") + "      ";
    } else if (list.networks.length < 9) {
        return chalk.bgCyan.white("Good") + "      ";
    } else {
        return chalk.bgGreen.white("Excellent") + "      ";
    }
}

function getArchiveSize() {
    let size = 0;
    let list = fs.readdirSync("./archive");

    for (let file of list) {
        size += fs.readFileSync("./archive/" + file).length;
    }

    return formatSize(size, true);
}

function data() {
    if (!run) return;
    let mem = process.memoryUsage();

    setInfo(0, list ? connectionQuality() : "-", true)
    setInfo(1, list ? list.networks.length + " beacons" : "-")
    setInfo(2, list ? known.length + " unique beacons" : "-")
    setInfo(3, list ? Math.max(...list.networks.map(i => i.quality)) - Math.min(...list.networks.map(i => i.quality)) + " dB" : "-")
    setInfo(4, list ? progressBar(new Date() - list.update.getTime(), 5000, 24) : "-", true)

    setInfo(8, "DB: " + formatSize(JSON.stringify(db).length, true) + ", A: " + getArchiveSize())
    setInfo(9, Object.keys(db.known).length)
    setInfo(10, db.tags.length)
    setInfo(11, timeAgo(db.date))
    setInfo(12, crc32(JSON.stringify(db)).toString(16).toUpperCase())

    setInfo(16, process.versions.node)
    setInfo(17, process.versions.v8)
    setInfo(18, os.release())
    setInfo(19, require("child_process").execSync("/usr/sbin/NetworkManager --version").toString().trim())
    setInfo(20, formatTime(process.uptime()))
    setInfo(21, formatSize(mem.heapUsed + mem.external + mem.arrayBuffers))

    process.stdout.cursorTo(process.stdout.columns - 11, 1);
    process.stdout.write(chalk.bgBlue(new Date().toTimeString().substring(0, 5)));

    process.stdout.cursorTo(0, 35);

    let index = 0;
    for (let key of Object.keys(db.tags).reverse()) {
        if (index > 28) continue;
        let tag = db.tags[key];
        process.stdout.write("  " + tag.name + " ".repeat(50 - 2 - tag.name.length));
        process.stdout.cursorTo(0);
        process.stdout.moveCursor(0, 1);
        index++;
    }

    showTip();

    process.stdout.cursorTo(process.stdout.columns, process.stdout.rows)
}

function showTip() {
    process.stdout.cursorTo(0, process.stdout.rows - 2);
    process.stdout.write("━".repeat(50) + "┻" + "━".repeat(netListSize) + "┻" + "━".repeat(process.stdout.columns - netListSize - 52));

    process.stdout.cursorTo(0, process.stdout.rows - 1);
    process.stdout.write(" ".repeat(process.stdout.columns));

    process.stdout.cursorTo(process.stdout.columns - version.length - 3, process.stdout.rows - 1);
    process.stdout.write(chalk.blue("v" + version));

    process.stdout.cursorTo(2, process.stdout.rows - 1);
    process.stdout.write(chalk.cyan("Enter: ") + "Add new tag   " + chalk.cyan("Ctrl+C: ") + "Exit  ");
    process.stdout.cursorTo(7, process.stdout.rows - 1);
}

function scan() {
    if (!run) return;

    process.stdout.cursorTo(process.stdout.columns - 4, 1);
    process.stdout.write(chalk.bgBlack("  "));

    wifi.scan((error, networks) => {
        if (error) throw error;

        list = {
            update: new Date(),
            networks: networks.filter(i => i.signal_level > -90).map(i => {
                if (!known.includes(i.bssid)) known.push(i.mac);

                return {
                    id: i.mac.replaceAll(":", ""),
                    quality: i.signal_level
                }
            })
        }

        refreshLocation();
        refreshList();
        refreshLocation();
        showTip();

        process.stdout.cursorTo(process.stdout.columns - 4, 1);
        process.stdout.write(chalk.bgGreen("  "));
    });
}

function refreshLocation() {
    results = [];

    process.stdout.cursorTo(54, 5);

    let tags = {};

    for (let network of list.networks) {
        if (Object.keys(db.known).includes(network.id) && db.known[network.id].length > 0) {
            for (let id of db.known[network.id]) {
                if (!tags[id]) tags[id] = [];

                let tag = db.tags.filter(i => i.id === id)[0];

                let current = network.quality;
                let expected = tag.beacons.filter(i => i.id === network.id)[0].quality;
                let distance = Math.abs(expected - current);

                tags[id].push(distance);
            }
        }
    }

    for (let tag in tags) {
        let average = tags[tag].reduce((a, b) => a + b) / tags[tag].length;
        results.push({
            score: average,
            item: db.tags.filter(i => i.id === tag)[0]
        })
    }

    let uniques = {};
    let uniqueScores = {};

    for (let network of list.networks) {
        if (Object.keys(db.known).includes(network.id) && db.known[network.id].length === 1) {
            if (!uniques[db.known[network.id][0]]) uniques[db.known[network.id][0]] = 0;
            uniques[db.known[network.id][0]]++;

            if (!uniqueScores[db.known[network.id][0]]) uniqueScores[db.known[network.id][0]] = [];

            let current = network.quality;
            let expected = db.tags.filter(i => i.id === db.known[network.id][0])[0].beacons.filter(i => i.id === network.id)[0].quality;
            let distance = Math.abs(expected - current);

            uniqueScores[db.known[network.id][0]].push(distance);
        }
    }

    for (let tag in uniqueScores) {
        uniqueScores[tag] = uniqueScores[tag].reduce((a, b) => a + b) / uniqueScores[tag].length;
    }

    let uniquesSorted = [];

    for (let key in uniques) {
        uniquesSorted.push({
            id: key,
            value: uniques[key]
        });
    }

    uniquesSorted = uniquesSorted.filter(i => i['value'] > 0).sort((a, b) => b['value'] - a['value']);


    if (uniquesSorted.length > 0) {
        results.push({
            score: uniqueScores[uniquesSorted[0].id] / 3,
            item: db.tags.filter(i => i.id === uniquesSorted[0].id)[0]
        })
    }

    results = results.sort((a, b) => a['score'] - b['score']);
    process.stdout.cursorTo(54, 5);

    if (list.networks.length === 0) {
        process.stdout.write(chalk.red("Error -1 (No beacons within device range)") + " ".repeat(process.stdout.columns - 54 - 41));
    } else if (list.networks.length < 3) {
        process.stdout.write(chalk.red("Error -2 (Not enough beacons detected)") + " ".repeat(process.stdout.columns - 54 - 38));
    } else if (results.length === 0) {
        process.stdout.write(chalk.red("Error -3 (No matching tag found for the nearby beacons)") + " ".repeat(process.stdout.columns - 54 - 55));
    } else if (Object.keys(db.tags).length === 0) {
        process.stdout.write(chalk.red("Error -5 (No tags in database)") + " ".repeat(process.stdout.columns - 54 - 30));
    } else if (results.length > 0) {
        let first = results[0];
        process.stdout.write(chalk.cyan("Top Result: ") + chalk.blue("[" + first.item.id + "] ") + first.item.name + " ".repeat(process.stdout.columns - 54 - first.item.name.length - first.item.id.length - 15));
    } else {
        process.stdout.write(chalk.red("Error 0 (Undefined internal error)") + " ".repeat(process.stdout.columns - 54 - 34));
    }
}

function refreshList() {
    if (!run) return;

    process.stdout.cursorTo(54, 9);
    process.stdout.write(chalk.cyan("Beacons Found"));

    process.stdout.cursorTo(54, 11);
    process.stdout.write("  Beacon ID       ┃  Signal      ┃  Linked Tags");
    process.stdout.cursorTo(54, 12);
    process.stdout.write("━━━━━━━━━━━━━━━━━━╋━━━━━━━━━━━━━━╋━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    for (let i = 8; i < process.stdout.rows - 2; i++) {
        process.stdout.cursorTo(51 + netListSize, i);
        process.stdout.write("┃");
    }

    let ind = 0;

    if (list) {
        for (let network of list.networks) {
            if (ind > 52) continue;
            process.stdout.cursorTo(56, 13 + ind);

            let linked = (db.known[network.id] ? (db.known[network.id].length > 1 ? "<" + db.known[network.id].length + " tags>" : db.tags.filter(i => i.id === db.known[network.id][0])[0].name) : "<none>");

            if (linked.length > 32) {
                linked = linked.substring(0, 31) + "…";
            }

            let text = "#" + network.id + "   ┃  " + network.quality + " dB" + " ".repeat(9 - network.quality.toString().length) + "┃  " + linked;

            process.stdout.write(text + " ".repeat(netListSize - text.length - 5));
            ind++;
        }
    }

    for (let j = 12 + ind; j < process.stdout.rows - 2; j++) {
        process.stdout.cursorTo(51, j);
        process.stdout.write(" ".repeat(netListSize - 1));
    }

    process.stdout.cursorTo(132, 9);
    process.stdout.write(chalk.cyan("Results by Accuracy"));

    let index = 0;
    for (let result of results) {
        if (index > 52) continue;
        process.stdout.cursorTo(132, 11 + index);

        let scoreSize = result.score.toFixed(2).length;
        let name = result.item.name;

        if (name.length > process.stdout.columns - (scoreSize + 188)) {
            name = name.substring(0, process.stdout.columns - (scoreSize + 189)) + "…";
        }

        let text = chalk.blue("[" + result.item.id + "] ") + name + chalk.magentaBright(" (accuracy: " + result.score.toFixed(2) + ")");

        process.stdout.write(text + " ".repeat(process.stdout.columns - 50 - netListSize - text.length))
        index++;
    }

    if (index === 0) {
        process.stdout.cursorTo(132, 11);
        process.stdout.write("No results found.");
        index++;

        process.stdout.cursorTo(132, 12);
        process.stdout.write("See the status bar for an error message.");
        index++;
    }

    for (let j = 11 + index; j < process.stdout.rows - 2; j++) {
        process.stdout.cursorTo(132, j);
        process.stdout.write(" ".repeat(netListSize - 1));
    }
}

refresh();
data();
scan();

setInterval(() => {
    scan();
}, 3000);

setInterval(() => {
    data();
}, 200);