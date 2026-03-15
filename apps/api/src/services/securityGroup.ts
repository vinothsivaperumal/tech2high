import { AuthorizeSecurityGroupIngressCommand, EC2Client } from "@aws-sdk/client-ec2";

import { env } from "../config/env";

const ec2 = new EC2Client({
  region: env.AWS_REGION,
  credentials: {
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    ...(env.AWS_SESSION_TOKEN.trim() ? { sessionToken: env.AWS_SESSION_TOKEN } : {})
  }
});

export async function allowIngressForStudentIp(params: {
  ipAddress: string;
  protocol: string;
  port: number;
}): Promise<{ alreadyExists: boolean }> {
  const { ipAddress, protocol, port } = params;
  const cidr = `${ipAddress}/32`;

  try {
    await ec2.send(
      new AuthorizeSecurityGroupIngressCommand({
        GroupId: env.AWS_SECURITY_GROUP_ID,
        IpPermissions: [
          {
            IpProtocol: protocol,
            FromPort: port,
            ToPort: port,
            IpRanges: [
              {
                CidrIp: cidr,
                Description: `${env.AWS_SECURITY_GROUP_NAME} approved student IP`
              }
            ]
          }
        ]
      })
    );

    return { alreadyExists: false };
  } catch (error) {
    const awsError = error as { name?: string; Code?: string; code?: string };
    const code = awsError.Code ?? awsError.code;

    if (awsError.name === "InvalidPermission.Duplicate" || code === "InvalidPermission.Duplicate") {
      return { alreadyExists: true };
    }

    throw error;
  }
}
