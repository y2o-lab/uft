import type { DiagramEdge, DiagramNode } from "../domain/workspace";

export const DIAGRAM_TEMPLATES = [
  { id: "flow", label: "フロー（分岐・戻り線）" },
  { id: "architecture", label: "システムアーキテクチャ" },
  { id: "aws-web", label: "AWS Web アプリ" },
  { id: "aws-serverless", label: "AWS サーバーレス" },
  { id: "er", label: "ER モデル" },
] as const;

export type DiagramTemplateId = (typeof DIAGRAM_TEMPLATES)[number]["id"];

type TemplateGraph = { nodes: DiagramNode[]; edges: DiagramEdge[] };

const edge = (
  id: string,
  source: string,
  target: string,
  options: Partial<DiagramEdge> = {},
): DiagramEdge => ({
  id,
  source,
  target,
  sourceHandle: "right",
  targetHandle: "left",
  type: "smoothstep",
  data: { direction: "forward", lineStyle: "solid" },
  ...options,
});

export function createDiagramTemplate(template: string): TemplateGraph {
  if (template === "architecture") {
    return {
      nodes: [
        node("client", 40, 145, "Web / Mobile", "component"),
        node("gateway", 280, 145, "API Gateway", "component"),
        node("service", 520, 145, "Application", "component"),
        node("database", 760, 65, "Primary DB", "database"),
        node("queue", 520, 295, "Event Queue", "queue"),
        node("worker", 760, 295, "Worker", "component"),
      ],
      edges: [
        edge("client-gateway", "client", "gateway"),
        edge("gateway-service", "gateway", "service"),
        edge("service-database", "service", "database"),
        edge("service-queue", "service", "queue", {
          sourceHandle: "bottom",
          targetHandle: "top",
        }),
        edge("queue-worker", "queue", "worker"),
        edge("worker-database", "worker", "database", {
          sourceHandle: "top",
          targetHandle: "bottom",
        }),
      ],
    };
  }
  if (template === "aws-web") {
    return {
      nodes: [
        awsNode("route53", 20, 145, "DNS", "amazon-route-53"),
        awsNode("cloudfront", 260, 145, "CDN", "amazon-cloud-front"),
        awsNode("alb", 500, 145, "Load Balancer", "elastic-load-balancing"),
        awsNode("ec2", 740, 145, "Application", "amazon-ec2"),
        awsNode("rds", 980, 60, "Database", "amazon-rds"),
        awsNode(
          "s3",
          500,
          330,
          "Static Assets",
          "amazon-simple-storage-service",
        ),
      ],
      edges: [
        edge("route53-cloudfront", "route53", "cloudfront"),
        edge("cloudfront-alb", "cloudfront", "alb"),
        edge("alb-ec2", "alb", "ec2"),
        edge("ec2-rds", "ec2", "rds"),
        edge("cloudfront-s3", "cloudfront", "s3", {
          sourceHandle: "bottom",
          targetHandle: "left",
        }),
      ],
    };
  }
  if (template === "aws-serverless") {
    return {
      nodes: [
        node("client", 20, 150, "Client", "component"),
        awsNode("api", 260, 150, "REST API", "amazon-api-gateway"),
        awsNode("lambda", 500, 150, "Function", "aws-lambda"),
        awsNode("dynamo", 750, 55, "Data", "amazon-dynamo-db"),
        awsNode("sqs", 500, 340, "Async jobs", "amazon-simple-queue-service"),
        awsNode("worker", 750, 340, "Worker", "aws-lambda"),
      ],
      edges: [
        edge("client-api", "client", "api"),
        edge("api-lambda", "api", "lambda"),
        edge("lambda-dynamo", "lambda", "dynamo"),
        edge("lambda-sqs", "lambda", "sqs", {
          sourceHandle: "bottom",
          targetHandle: "top",
        }),
        edge("sqs-worker", "sqs", "worker"),
        edge("worker-dynamo", "worker", "dynamo", {
          sourceHandle: "top",
          targetHandle: "bottom",
        }),
      ],
    };
  }
  if (template === "er") {
    return {
      nodes: [
        node("user", 70, 100, "User", "database"),
        node("order", 360, 100, "Order", "database"),
        node("item", 650, 100, "Item", "database"),
      ],
      edges: [
        edge("user-order", "user", "order", {
          label: "1 : N",
          data: { direction: "none", lineStyle: "solid" },
        }),
        edge("order-item", "order", "item", {
          label: "N : M",
          data: { direction: "none", lineStyle: "solid" },
        }),
      ],
    };
  }
  return {
    nodes: [
      node("start", 40, 145, "Start", "terminator"),
      node("review", 270, 145, "Review", "process"),
      node("approved", 520, 130, "Approved?", "decision"),
      node("finish", 790, 55, "Finish", "terminator"),
      node("rework", 520, 330, "Rework", "process"),
    ],
    edges: [
      edge("start-review", "start", "review"),
      edge("review-approved", "review", "approved"),
      edge("approved-finish", "approved", "finish", { label: "Yes" }),
      edge("approved-rework", "approved", "rework", {
        label: "No",
        sourceHandle: "bottom",
        targetHandle: "top",
      }),
      edge("rework-review", "rework", "review", {
        sourceHandle: "left",
        targetHandle: "bottom",
      }),
    ],
  };
}

function node(
  id: string,
  x: number,
  y: number,
  label: string,
  kind: DiagramNode["data"]["kind"],
): DiagramNode {
  return { id, type: "diagram", position: { x, y }, data: { label, kind } };
}

function awsNode(
  id: string,
  x: number,
  y: number,
  label: string,
  awsService: string,
): DiagramNode {
  return {
    id,
    type: "diagram",
    position: { x, y },
    data: { label, kind: "aws-service", awsService },
  };
}
