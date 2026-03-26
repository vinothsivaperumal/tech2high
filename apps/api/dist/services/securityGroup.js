"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.allowIngressForStudentIp = allowIngressForStudentIp;
const client_ec2_1 = require("@aws-sdk/client-ec2");
const env_1 = require("../config/env");
const ec2 = new client_ec2_1.EC2Client({
    region: env_1.env.AWS_REGION,
    credentials: {
        accessKeyId: env_1.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: env_1.env.AWS_SECRET_ACCESS_KEY,
        ...(env_1.env.AWS_SESSION_TOKEN.trim() ? { sessionToken: env_1.env.AWS_SESSION_TOKEN } : {})
    }
});
async function allowIngressForStudentIp(params) {
    const { ipAddress, protocol, port } = params;
    const cidr = `${ipAddress}/32`;
    try {
        await ec2.send(new client_ec2_1.AuthorizeSecurityGroupIngressCommand({
            GroupId: env_1.env.AWS_SECURITY_GROUP_ID,
            IpPermissions: [
                {
                    IpProtocol: protocol,
                    FromPort: port,
                    ToPort: port,
                    IpRanges: [
                        {
                            CidrIp: cidr,
                            Description: `${env_1.env.AWS_SECURITY_GROUP_NAME} approved student IP`
                        }
                    ]
                }
            ]
        }));
        return { alreadyExists: false };
    }
    catch (error) {
        const awsError = error;
        const code = awsError.Code ?? awsError.code;
        if (awsError.name === "InvalidPermission.Duplicate" || code === "InvalidPermission.Duplicate") {
            return { alreadyExists: true };
        }
        throw error;
    }
}
