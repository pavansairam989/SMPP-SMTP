const nodemailer=require('nodemailer');
const AWS= require("aws-sdk");

export const sendEmail = async (from: any, to: any, cc: any, subject: any, body: any,
    filePath: any = "", fileName: any = "") => {

    const transporter = nodemailer.createTransport({
        SES: new AWS.SES({
            accessKeyId: process.env.awsKeySES,
            secretAccessKey: process.env.awsSecretSES,
            region: process.env.awsRegionSES,
            apiVersion: '2010-12-01'
        })
    });
    let respObj: any = { status: true, eCode: '', eDesc: '' };

    const mailOptions = {
        from: from,
        to: to,
        cc: cc,
        subject: subject,
        html: body
    };
    if (filePath) {
        var obj = {
            attachments: [
                {
                    filename: fileName,
                    // content: buffer,
                    path: filePath,
                    encoding: "base64"
                }
            ]
        }
        Object.assign(mailOptions, obj);
    };
    await transporter.sendMail(mailOptions).then((response: any) => {
        respObj.status = true;
    }).catch((error: any) => {
        respObj.status = false;
        respObj.eCode = 500
        respObj.eDesc ='Error Msg: ' + error?.message;
    });
    return respObj;
};
