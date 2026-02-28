import { NextResponse } from "next/server";

type ErrorBody = {
  code: string;
  details?: unknown;
  message: string;
};

export const errorResponse = (
  status: number,
  message: string,
  code: string,
  details?: unknown
) => {
  const body: ErrorBody = { code, message };
  if (details !== undefined) {
    body.details = details;
  }

  return NextResponse.json(body, { status });
};
