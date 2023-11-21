const host = "https://01.kood.tech";

// Initial load and token check
document.addEventListener("DOMContentLoaded", function () {
    const token = localStorage.getItem('jwtToken');
    if (token) {
        const decoded = parseJwt(token);
        if (decoded.exp * 1000 < new Date().getTime()) {
            localStorage.clear();
            loginPage();
        } else {
            ownPage();
        }
    } else {
        loginPage();
    }

    function parseJwt (token) {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(window.atob(base64).split('').map(function(c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));

        return JSON.parse(jsonPayload);
    }
});

// Login page HTML
const loginPage = () => {
    const contentDiv = document.getElementById("content");
    contentDiv.innerHTML = `<div class="login-container">
        <h2>Login</h2>
        <form id="login-form">
            <input type="text" placeholder="Username / Email" id="username" required><br>
            <input type="password" placeholder="Password" id="password" required><br>
            <button type="submit">Login</button>
        </form>
        <p id="error-message" style="color: red;"></p>
    </div>`
    loginSubmit();
}

// Submit login form
const loginSubmit = () => {
    document.getElementById('login-form').addEventListener('submit', function(event) {
        event.preventDefault();

        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;

        const base64Credentials = btoa(username + ':' + password);

        fetch(`${host}/api/auth/signin`, {
            method: 'POST',
            headers: {
                'Authorization': 'Basic ' + base64Credentials,
                'Content-Type': 'application/json'
            }
        })
            .then(response => {
                if (response.ok) {
                    return response.json();
                } else {
                    throw new Error('Invalid credentials');
                }
            })
            .then(data => {
                localStorage.setItem('jwtToken', data);
                ownPage();
            })
            .catch(error => {
                document.getElementById('error-message').textContent = error.message;
            });
    });
}

// Logging out and removing token
const logout = () =>
    localStorage.removeItem('jwtToken');
    loginPage();

// Convert XP
const bytesTo = (bytes) =>
    bytes < 1000
        ? `${bytes} B`
        : bytes < 1000000 ? `${(bytes / 1000).toFixed(1)} kB` : `${(bytes / 1000000).toFixed(1)} MB`;

// Convert time
const convertTime = (dateTimeString) => {
    const dateTime = new Date(dateTimeString);
    const options = { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: 'numeric' };
    return dateTime.toLocaleDateString('en-US', options);
}

// Get info about xp/audits/skills
const other = (a) => {
    const trans = a.data.transaction;
    let sum = 0;
    let up = 0;
    let down = 0;
    let other = 0;
    let level = 0;
    let xpTasks = [""]
    let xpDates = [0];
    let xpList = [0];
    let audits = [];
    let skills = {};

    for (const b in trans) {
        const elem = trans[b];
        if (Object.keys(elem.attrs).length === 0) {
            if (elem.type === "xp" && !elem.path.includes("piscine")) {
                sum += elem.amount;
                xpDates.push(elem.createdAt);
                xpList.push(elem.amount);
                const task = elem.path.split("/");
                xpTasks.push(task[task.length-1])
            } else if (elem.type === "level" && !elem.path.includes("piscine")) {
                level = elem.amount;
            } else if (elem.type.includes("skill")) {
                const type = elem.type.replace("skill_", "");
                if (skills.hasOwnProperty(type)) {
                    skills[type] += elem.amount;
                } else {
                    skills[type] = elem.amount;
                }
            }
        } else {
            if (elem.type === "up" && !elem.path.includes("piscine")) {
                up += elem.amount;
                audits.push(elem.amount);
            } else if (elem.type === "down" && !elem.path.includes("piscine")) {
                down += elem.amount;
                audits.push(-elem.amount);
            } else {
                if (elem.type === "xp") {
                    other += elem.amount;
                }
            }
        }
    }

    return [level, sum, (up/down).toFixed(1), xpTasks, xpList, xpDates, audits, skills]
}


// Info page load
function ownPage() {
    const content = document.getElementById("content");
    let user = "";

    getData(`{
      user {
        id
        login
        attrs
      }
    }`)
        .then(function(userInfo) {
            user = userInfo.data.user[0];
            return getData(`{
          transaction(where: { userId: { _eq:${user.id} }}) {
            attrs
            amount
            type
            path
            user {
              id
            }
            createdAt
          }
        }`);
        })
        .then(function(otherInfo) {
            const [level, xp, auditRatio, xpTasks, xpList, xpDates, audits, skills] = other(otherInfo);

            content.innerHTML = `
            <div id="head" class="flex">
                <h2 id="hello" class="flex">Welcome, ${user.attrs.firstName} ${user.attrs.lastName}!</h2>
                <button id="logout-button">Logout</button>
            </div>`;
            function basicInfo() {
                const basic = {
                    "First name": `${user.attrs.firstName}`,
                    "Last name": `${user.attrs.lastName}`,
                    "Nickname": `${user.login}`,
                    "ID": `${user.id}`,
                    "XP": `${bytesTo(xp)}`,
                    "Level": `${level}`,
                    "Audit Ratio": `${auditRatio}`,
                    "Skills": skills
                }
                let p = "";
                for (let key in basic) {
                    let value = "";
                    let ul = false;
                    if (typeof basic[key] === 'string') {
                        value = basic[key];
                    } else {
                        ul = true;
                        let sk = "";
                        for (let skillKey in basic[key]) {
                            sk += `<li class="infoKey">${skillKey}: <span class="infoValue">${basic[key][skillKey]}</span></li>`;
                        }
                        value = `<ul>${sk}</ul>`
                    }
                    if (!ul) {
                        value = `<span class="infoValue">${value}</span>`;
                    }
                    p += `<p class="infoKey">${key}: ${value}</p>`;
                }
                return `<div class="info">${p}</div>`
            }

            function lineGraph(info) {
                let points = ``;
                let dots = ``;
                let xpU = xp;
                let ex = 100/xp;
                let ex2 = 50/info.length;
                for (let i = 0; i < info.length; i++) {
                    xpU -= xpList[i]
                    const x = `${(i*ex2).toFixed(0)*10}`
                    const y = `${(xpU*ex).toFixed(0)}`
                    points += `${x},${y} `;
                    dots += `<circle cx="${x}" cy="${y}" r="2" fill="var(--divbg)" stroke="var(--lines)">
                        <title>${xpTasks[i]}\n${convertTime(xpDates[i])}\n+${bytesTo(xpList[i])}</title>
                     </circle>\n`;
                }
                return `
            <svg viewBox="0 0 500 100" class="chart lineChart">
              
              <polyline
                 fill="none"
                 stroke="var(--main)"
                 stroke-width="1"
                 points="${points}"
               />
               
               ${dots}
              <line stroke="var(--lines)" x1="0" y1="100" x2="500" y2="100"></line>
              <line stroke="var(--lines)" x1="0" y1="100" x2="0" y2="0"></line>
              
            </svg>`
            }

            function barGraph() {
                let bars = ``;
                const max = Math.max(...xpList);
                const width = 500/(xpList.length-1);
                for (let i = 0; i < xpList.length; i++) {
                    const h = xpList[i]*500/max;
                    const j = i - 1;
                    bars += `<rect width="${width}" height="${h}" x="${j*width}" y="${500-h}" fill="var(--main)"><title>${xpTasks[i]}\n${convertTime(xpDates[i])}\n${bytesTo(xpList[i])}</title></rect>\n`;
                    bars += `<circle cx="${j*width}" cy="500" r="2" fill="var(--lines)"></circle>\n`;
                    bars += `<circle cx="0" cy="${(500/xpList.length)*j}" r="2" fill="var(--lines)"></circle>\n`;
                }
                bars += `<circle cx="500" cy="500" r="2" fill="var(--lines)"></circle>\n`;
                return `
            <svg width="500" height="500" class="chart chart2">
               ${bars}
              <line stroke="var(--lines)" x1="0" y1="500" x2="500" y2="500"></line>
              <line stroke="var(--lines)" x1="0" y1="500" x2="0" y2="0"></line>
            </svg>`
            }

            function pieGraph(info) {
                let pos = 0;
                let neg = 0;
                for (let i = 0; i < info.length; i++) {
                    if (info[i] > 0) {
                        pos++;
                    } else {
                        neg++;
                    }
                }
                return `
            <svg height="500" width="500" viewBox="0 0 20 20" class="chart chart2">
              <circle r="10" cx="10" cy="10" fill="var(--main)"><title>Received\n${neg}</title></circle>
              <circle r="5" cx="10" cy="10" fill="transparent"
                      stroke="var(--hover)"
                      stroke-width="10"
                      stroke-dasharray="calc(${pos*100/info.length} * 31.4 / 100) 31.4"
                      transform="rotate(-90) translate(-20)"><title>Done\n${pos}</title></circle>
            </svg>`;
            }
            let body = "";
            body += "<h2>Your basic info:</h2>";
            body += basicInfo();
            body += "<h2>Total XP:</h2>";
            body += lineGraph(xpList);
            body += "<h2>XP from completed tasks:</h2>";
            body += barGraph(xpList);
            body += "<h2>Nr of audits done/received:</h2>";
            body += pieGraph(audits);
            content.innerHTML += `<div class="body">${body}</div>`;
            document.getElementById('logout-button').addEventListener('click', function() {
                logout();
            });
        })
        .catch(function(error) {
            console.log("Error:", error);
        });
}

// Send graphql request
function getData(query) {
    return fetch(`${host}/api/graphql-engine/v1/graphql`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem('jwtToken')}`
        },
        body: JSON.stringify({ query: query }),
    })
        .then(function(response) {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response.json();
        })
        .then(function(data) {
            if (data.errors) {
                throw new Error(`GraphQL Errors: ${data.errors}`);
            }
            return data;
        })
        .catch(function(error) {
            throw error;
        });
}