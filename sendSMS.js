const smpp = require('smpp');

console.log('Creating SMPP session...');
const session = smpp.connect({
    url: 'smpp://127.0.0.1:2775',
    auto_enquire_link_period: 10000,
    debug: true
});

let isConnected = false;

// Debug logging
function debugLog(message, ...args) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${message}`, ...args);
}

// Error handler
session.on('error', (error) => {
    debugLog('SMPP Error:', error);
});

// Connect and bind
async function connectAndBind() {
    try {
        debugLog('Attempting to connect...');
        
        // Wait for connection
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Connection timeout after 10 seconds'));
            }, 10000);

            session.on('connect', () => {
                clearTimeout(timeout);
                resolve();
            });
        });

        debugLog('Connected to SMPP server');

        // Bind as transmitter
        const bindResult = await new Promise((resolve, reject) => {
            debugLog('Attempting to bind...');
            session.bind_transceiver({
                system_id: '',  // Empty for testing
                password: '',   // Empty for testing
            }, (pdu) => {
                if (pdu.command_status === 0) {
                    resolve(pdu);
                } else {
                    reject(new Error(`Bind failed with status ${pdu.command_status}`));
                }
            });
        });

        debugLog('Successfully bound to SMPP server', bindResult);
        isConnected = true;

        // Setup PDU event handlers
        setupEventHandlers();

        // Run test scenarios
        await runTestScenarios();

    } catch (error) {
        debugLog('Connection error:', error);
        try {
            session.close();
        } catch (closeError) {
            debugLog('Error while closing session:', closeError);
        }
        process.exit(1);
    }
}

function setupEventHandlers() {
    // Handle delivery reports
    session.on('deliver_sm', (pdu) => {
        console.log('Received delivery report:', pdu);
        
        // Acknowledge receipt of delivery report
        session.deliver_sm_resp({
            sequence_number: pdu.sequence_number,
        });
    });

    // Handle enquire link requests
    session.on('enquire_link', (pdu) => {
        console.log('Received enquire_link');
        session.enquire_link_resp({
            sequence_number: pdu.sequence_number,
        });
    });
}

// Split long message into parts
function splitLongMessage(message, maxLength = 140) {
    const parts = [];
    for (let i = 0; i < message.length; i += maxLength) {
        parts.push(message.slice(i, i + maxLength));
    }
    return parts;
}

async function sendMessage(messageConfig) {
    if (!isConnected) {
        console.error('Not connected to SMPP server');
        return;
    }

    try {
        const messageText = messageConfig.short_message;
        
        // Check if message needs to be split
        if (messageText.length > 140) {
            debugLog('Message length exceeds 140 characters, splitting into parts');
            const parts = splitLongMessage(messageText);
            const results = [];

            for (let i = 0; i < parts.length; i++) {
                const partConfig = {
                    ...messageConfig,
                    short_message: parts[i],
                    esm_class: 0x40, // Set UDH indicator
                    // Add message part information in UDH
                    message_payload: parts[i],
                    sar_msg_ref_num: Math.floor(Math.random() * 65535), // Random reference number
                    sar_total_segments: parts.length,
                    sar_segment_seqnum: i + 1
                };

                const result = await new Promise((resolve, reject) => {
                    session.submit_sm(partConfig, (pdu) => {
                        if (pdu.command_status === 0) {
                            resolve(pdu);
                        } else {
                            reject(new Error(`Submit failed with status ${pdu.command_status}`));
                        }
                    });
                });

                results.push(result);
                debugLog(`Sent part ${i + 1} of ${parts.length}`);
            }

            return results;
        } else {
            // Send single message
            const submitResult = await new Promise((resolve, reject) => {
                session.submit_sm(messageConfig, (pdu) => {
                    if (pdu.command_status === 0) {
                        resolve(pdu);
                    } else {
                        reject(new Error(`Submit failed with status ${pdu.command_status}`));
                    }
                });
            });

            debugLog('Message sent successfully:', submitResult);
            return submitResult;
        }
    } catch (error) {
        debugLog('Error sending message:', error);
        throw error;
    }
}

async function runTestScenarios() {
    try {
        console.log('\n=== Running Test Scenarios ===\n');

        // Scenario 1: Simple Text Message
        console.log('Scenario 1: Sending Simple Text Message');
        await sendMessage({
            source_addr: 'TestSender',
            destination_addr: '1234567890',
            short_message: 'Hello from Node.js SMPP client!',
            registered_delivery: 1,
        });

        // Wait between scenarios
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Scenario 2: Unicode Message (e.g., Chinese characters)
        console.log('\nScenario 2: Sending Unicode Message');
        await sendMessage({
            source_addr: 'TestSender',
            destination_addr: '1234567890',
            short_message: '你好，世界！',
            data_coding: 0x08, // UCS2 encoding
            registered_delivery: 1,
        });

        // Wait between scenarios
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Scenario 3: Flash Message
        console.log('\nScenario 3: Sending Flash Message');
        await sendMessage({
            source_addr: 'TestSender',
            destination_addr: '1234567890',
            short_message: 'This is a flash message!',
            esm_class: 0x10, // Message Type: Flash Message
            registered_delivery: 1,
        });

        // Wait between scenarios
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Scenario 4: Long Message (Message will be split automatically)
        console.log('\nScenario 4: Sending Long Message');
        await sendMessage({
            source_addr: 'TestSender',
            destination_addr: '1234567890',
            short_message: 'This is a very long message that exceeds the standard SMS length. It will demonstrate how the SMPP protocol handles messages that need to be split into multiple parts. The message continues with more text to ensure it goes beyond the standard 160 characters limit for a single SMS.',
            registered_delivery: 1,
        });

        // Scenario 5: Message with Custom Validity Period
        console.log('\nScenario 5: Sending Message with Validity Period');
        await sendMessage({
            source_addr: 'TestSender',
            destination_addr: '1234567890',
            short_message: 'This message has a validity period of 1 hour',
            validity_period: new Date(Date.now() + 3600000).toISOString(), // 1 hour from now
            registered_delivery: 1,
        });

        console.log('\n=== Test Scenarios Completed ===\n');

    } catch (error) {
        console.error('Error in test scenarios:', error);
    }
}

// Handle process termination
process.on('SIGINT', async () => {
    if (isConnected) {
        console.log('Unbinding...');
        await new Promise((resolve) => {
            session.unbind(resolve);
        });
    }
    console.log('Closing connection...');
    session.close();
    process.exit();
});

// Start the application
console.log('Starting SMPP client...');
connectAndBind().catch(console.error); 
