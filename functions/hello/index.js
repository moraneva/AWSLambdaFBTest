var amazon = require('amazon-product-api');
var https = require('https');
var Q = require('q');
var facebookEventConverter = require('facebook-event-converter');
var Wit = require('cse498capstonewit').Wit;

var PAGE_TOKEN = process.env.FB_PAGE_TOKEN;

var path = '/v2.6/me/messages?access_token=' + PAGE_TOKEN;
var options = {
    host: "graph.facebook.com",
    path: path,
    method: 'POST',
    headers: {'Content-Type': 'application/json'}
};

exports.handle = function (event, context, callback) {


    console.log(JSON.stringify(facebookEventConverter.convertEvent(event)));
    console.log(JSON.stringify(event));
    var messagingEvents = event.entry[0].messaging;

    const client = new Wit({accessToken: process.env.WIT_TOKEN});

    for (var i = 0; i < messagingEvents.length; i++) {
        var messagingEvent = messagingEvents[i];

        var sender = messagingEvent.sender.id;
        if (event.entry.id == sender)
            return;




        if (messagingEvent.message && messagingEvent.message.text) {
            var text = messagingEvent.message.text;

            sendTypingMessage(sender);

            client.message(text, {}).then(function (response) {
                console.log('wit response ' + JSON.stringify(response));
                if (response.entities.intent[0].value != "search") {
                    sendTextMessage(sender, response.entities.search_query[0].value);
                }
                else{
                    var client = amazon.createClient({
                        awsId: process.env.AWS_ID,
                        awsSecret: process.env.AWS_SECRET,
                        awsTag: "evanm-20"
                    });

                    return client.itemSearch({
                        searchIndex: 'All',
                        keywords: response.entities.search_query[0].value,
                        responseGroup: 'ItemAttributes,Offers,Images'
                    }).then(function (results) {
                        sendGenericTemplateMessage(sender, results);
                    });
                }
            });

        }
    }

};

// This will contain all user sessions.
// Each session has an entry:
// sessionId -> {fbid: facebookUserId, context: sessionState}
const sessions = {};

const findOrCreateSession = function (fbid) {
    var sessionId;
    // Let's see if we already have a session for the user fbid
    Object.keys(sessions).forEach(function (k) {
        if (sessions[k].fbid === fbid) {
            // Yep, got it!
            sessionId = k;
        }
    });
    if (!sessionId) {
        // No session found for user fbid, let's create a new one
        sessionId = new Date().toISOString();
        sessions[sessionId] = {fbid: fbid, context: {}};
    }
    return sessionId;
};

function sendGenericTemplateMessage(senderFbId, resultsJson) {

    var elements = [];

    resultsJson.forEach(function (product) {
        var element = {};
        element.title = product && product.ItemAttributes[0] && product.ItemAttributes[0].Title[0];
        element.item_url = product && product.DetailPageURL[0];
        element.image_url = product && product.LargeImage && product.LargeImage[0] && product.LargeImage[0].URL[0];
        element.subtitle = product && product.OfferSummary && product.OfferSummary[0] &&
            product.OfferSummary[0].LowestNewPrice && product.OfferSummary[0].LowestNewPrice[0].FormattedPrice[0];
        element.buttons = [
            {
                "type": "web_url",
                "url": "https://cse.msu.edu",
                "title": "Add to Cart"
            }];

        elements.push(element);
    });

    var json = {
        recipient: {id: senderFbId},
        message: {
            "attachment": {
                "type": "template",
                "payload": {
                    "template_type": "generic",
                    "elements": elements
                }
            }
        }
    };

    return callSendAPI(json);
}

function sendTextMessage(senderFbId, text) {
    var json = {
        recipient: {id: senderFbId},
        message: {
            "text": text
        }
    };

    return callSendAPI(json);
}

function sendTypingMessage(senderFbId) {

    var typingJson = {
        "recipient": {
            "id": senderFbId
        },
        "sender_action": "typing_on"
    };

    callSendAPI(typingJson);
}

function callSendAPI(messageData) {

    var callback = function (response) {
        var str = '';
        response.on('data', function (chunk) {
            str += chunk;
        });
        response.on('end', function () {
        });
    };
    var req = https.request(options, callback);
    req.on('error', function (e) {
        console.log('problem with request: ' + e);
    });

    req.write(JSON.stringify(messageData));
    req.end();
}
