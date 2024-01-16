// Constants
const oauthConfig = chrome.runtime.getManifest().oauth2;

const CLIENT_ID = encodeURIComponent(oauthConfig.client_id);
const RESPONSE_TYPE = encodeURIComponent("token");
const SCOPE = encodeURIComponent(oauthConfig.scopes.join(" "));
const STATE = encodeURIComponent('meet' + Math.random().toString(36).substring(2, 15));

function createTwitchEndpoint() {
    const nonce = encodeURIComponent(Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15));
    const REDIRECT_URI = encodeURIComponent(chrome.identity.getRedirectURL('twitch'));
    return `https://id.twitch.tv/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=${RESPONSE_TYPE}&scope=${SCOPE}&state=${STATE}&nonce=${nonce}`;
}

document.addEventListener('DOMContentLoaded', function () {
    checkTwitchLogin();
    document.getElementById('loginBtn').addEventListener('click', loginToTwitch);
    document.getElementById('startPollBtn').addEventListener('click', createPollFromTalesUp);
});

function checkTwitchLogin() {
    const twitchAccessToken = localStorage.getItem('twitchAccessToken');
    if (twitchAccessToken) {
        checkTokenValidity(twitchAccessToken)
            .then((isValid) => {
                if (isValid) {
                    console.log('User is already logged in to Twitch.');
                    fetchTwitchUserInfo().then(() => {
                        document.querySelector('.root').classList.remove('hidden');
                    });
                } else {
                    console.log('Twitch access token is expired. Logging in again.');
                    document.querySelector('.root').classList.remove('hidden');
                }
            })
            .catch((error) => {
                console.error('Error checking Twitch token validity:', error);
            });
    } else {
        document.querySelector('.root').classList.remove('hidden');
    }
}

function loginToTwitch() {
    chrome.identity.launchWebAuthFlow(
        {
            url: createTwitchEndpoint(),
            interactive: true,
        },
        function (redirectUrl) {
            const accessToken = extractAccessTokenFromUrl(redirectUrl);
            if (accessToken) {
                localStorage.setItem('twitchAccessToken', accessToken);
                console.log('Successfully logged in to Twitch!');
                fetchTwitchUserInfo();
            } else {
                console.error('Twitch login failed. Unable to extract access token.');
            }
        }
    );
}

function checkTokenValidity(accessToken) {
    return new Promise((resolve, reject) => {
        const validationUrl = `https://id.twitch.tv/oauth2/validate`;
        fetch(validationUrl, {
            headers: {
                'Authorization': `OAuth ${accessToken}`,
                'Client-ID': CLIENT_ID,
            },
        })
            .then((response) => resolve(response.status === 200))
            .catch((error) => reject(error));
    });
}

function fetchTwitchUserInfo() {
    return new Promise((resolve, reject) => {
        const userInfoUrl = 'https://api.twitch.tv/helix/users';
        const accessToken = localStorage.getItem('twitchAccessToken');

        fetch(userInfoUrl, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Client-ID': CLIENT_ID,
            },
        })
            .then((response) => response.json())
            .then((data) => {
                const user = data.data[0];
                const username = user.display_name;
                const id = user.id;
                const profilePicture = user.profile_image_url;

                localStorage.setItem('broadcasterId', id);

                document.querySelector('h4').textContent = username;
                document.querySelector('#profile').src = profilePicture;
                document.querySelector('#profile').classList.remove('hidden');
                document.querySelector('.login').classList.add('hidden');
                document.querySelector('.poll').classList.remove('hidden');
                resolve(user);
            })
            .catch((error) => {
                console.error('Error fetching Twitch user information:', error);
                reject(error);
            });
    });
}

function createTwitchPoll(question, answers) {
    const pollUrl = 'https://api.twitch.tv/helix/polls';
    const accessToken = localStorage.getItem('twitchAccessToken');

    const pollData = {
        broadcaster_id: localStorage.getItem('broadcasterId'),
        title: "Alors, que fait-on ?", // question,
        choices: answers.slice(0, 5).map((e) => { return { "title": e.length > 24 ? e.substring(0, 21) + '...' : e }; }),
        duration: 60,
    };

    console.log(pollData, JSON.stringify(pollData));

    fetch(pollUrl, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Client-ID': CLIENT_ID,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(pollData),
    })
        .then((response) => response.json())
        .then((data) => {
            if (!data || data.error) {
                document.getElementById('startPollBtn').textContent = 'Error';
                console.log('Twitch Poll Error:', data);
            }
            else {
                document.getElementById('startPollBtn').textContent = 'Done';
                console.log('Twitch Poll Created:', data);
            }
        })
        .catch((error) => {
            console.error('Error creating Twitch poll:', error);
        });
}

function createPollFromTalesUp() {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        const activeTab = tabs[0];
        if (activeTab.url.includes('talesup.io')) {
            chrome.scripting.executeScript({
                target: { tabId: activeTab.id },
                function: injectContentScript,
            }).then((data) => {
                data.forEach((d) => {
                    if (d.result) {
                        const question = d.result.shift();
                        const answers = d.result;
                        createTwitchPoll(question, answers);
                    }
                    else {
                        console.error('Could not get page content.');
                    }
                });
            });
        } else {
            console.error('Not on the proper talesup.io page.');
        }
    });
}

function injectContentScript() {
    const textContentArray = [];
    const question = document.querySelector("#root p.MuiTypography-root.MuiTypography-body1[style*='opacity: 1']");
    const paragraphs = document.querySelectorAll("#root .MuiBox-root[style*='display: flex'] button p.MuiTypography-root.MuiTypography-body1");

    textContentArray.push(question.textContent.trim());
    paragraphs.forEach((paragraph) => {
        const textContent = paragraph.textContent.trim();
        textContentArray.push(textContent);
    });

    console.log(textContentArray);
    return textContentArray;
}

function extractAccessTokenFromUrl(url) {
    console.log('url: ' + url);
    if (url) {
        const match = url.match(/#access_token=([^&]+)/);
        return match && match[1] ? match[1] : null;
    }
    return null;
}