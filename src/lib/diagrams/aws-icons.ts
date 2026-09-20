import apiGateway from "@aws-icons/svg/icons/architecture-service/amazon-api-gateway.svg?raw";
import cloudFront from "@aws-icons/svg/icons/architecture-service/amazon-cloud-front.svg?raw";
import dynamoDb from "@aws-icons/svg/icons/architecture-service/amazon-dynamo-db.svg?raw";
import ec2 from "@aws-icons/svg/icons/architecture-service/amazon-ec2.svg?raw";
import ecs from "@aws-icons/svg/icons/architecture-service/amazon-elastic-container-service.svg?raw";
import rds from "@aws-icons/svg/icons/architecture-service/amazon-rds.svg?raw";
import route53 from "@aws-icons/svg/icons/architecture-service/amazon-route-53.svg?raw";
import sqs from "@aws-icons/svg/icons/architecture-service/amazon-simple-queue-service.svg?raw";
import s3 from "@aws-icons/svg/icons/architecture-service/amazon-simple-storage-service.svg?raw";
import vpc from "@aws-icons/svg/icons/architecture-service/amazon-virtual-private-cloud.svg?raw";
import lambda from "@aws-icons/svg/icons/architecture-service/aws-lambda.svg?raw";
import loadBalancing from "@aws-icons/svg/icons/architecture-service/elastic-load-balancing.svg?raw";

export const AWS_SERVICES = [
  { id: "amazon-api-gateway", label: "Amazon API Gateway", svg: apiGateway },
  { id: "amazon-cloud-front", label: "Amazon CloudFront", svg: cloudFront },
  { id: "amazon-dynamo-db", label: "Amazon DynamoDB", svg: dynamoDb },
  { id: "amazon-ec2", label: "Amazon EC2", svg: ec2 },
  { id: "amazon-elastic-container-service", label: "Amazon ECS", svg: ecs },
  {
    id: "elastic-load-balancing",
    label: "Elastic Load Balancing",
    svg: loadBalancing,
  },
  { id: "amazon-rds", label: "Amazon RDS", svg: rds },
  { id: "amazon-route-53", label: "Amazon Route 53", svg: route53 },
  { id: "amazon-simple-storage-service", label: "Amazon S3", svg: s3 },
  { id: "amazon-simple-queue-service", label: "Amazon SQS", svg: sqs },
  { id: "amazon-virtual-private-cloud", label: "Amazon VPC", svg: vpc },
  { id: "aws-lambda", label: "AWS Lambda", svg: lambda },
] as const;

export type AwsServiceId = (typeof AWS_SERVICES)[number]["id"];

const serviceById = new Map<string, (typeof AWS_SERVICES)[number]>(
  AWS_SERVICES.map((service) => [service.id, service]),
);

export function getAwsService(id: string | undefined) {
  return id ? serviceById.get(id) : undefined;
}

export function awsIconDataUrl(id: string | undefined): string {
  const svg = getAwsService(id)?.svg;
  return svg ? `data:image/svg+xml,${encodeURIComponent(svg)}` : "";
}
