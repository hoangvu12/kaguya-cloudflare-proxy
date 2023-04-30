type Options = {
  ignoreReqHeaders: boolean;
  followRedirect: boolean;
  redirectWithProxy: boolean;
  decompress: boolean;
  appendReqHeaders: [string, string][];
  appendResHeaders: [string, string][];
  deleteReqHeaders: string[];
  deleteResHeaders: string[];
};

function logEntries(iterator: IterableIterator<[key: string, value: string]>) {
  let string = "";

  for (const [key, value] of iterator) {
    string += `${key}: ${value}\n`;
  }

  return string;
}

async function handleRequest(request: Request) {
  const url = new URL(request.url);
  const proxyUrl = url.searchParams.get("url");
  const host = new URL(proxyUrl as string).host;

  if (!proxyUrl) {
    return new Response("Missing URL parameter", { status: 400 });
  }

  const options: Options = {
    ignoreReqHeaders: false,
    followRedirect: true,
    redirectWithProxy: true,
    decompress: false,
    appendReqHeaders: [],
    appendResHeaders: [],
    deleteReqHeaders: [],
    deleteResHeaders: [],
  };

  const ignoreReqHeaders = url.searchParams.get("ignoreReqHeaders");
  if (ignoreReqHeaders) {
    options.ignoreReqHeaders = ignoreReqHeaders === "true";
  }

  const followRedirect = url.searchParams.get("followRedirect");
  if (followRedirect) {
    options.followRedirect = followRedirect === "true";
  }

  const redirectWithProxy = url.searchParams.get("redirectWithProxy");
  if (redirectWithProxy) {
    options.redirectWithProxy = redirectWithProxy === "true";
  }

  const decompress = url.searchParams.get("decompress");
  if (decompress) {
    options.decompress = decompress === "true";
  }

  const appendReqHeaders = url.searchParams.get("appendReqHeaders");
  if (appendReqHeaders) {
    options.appendReqHeaders = JSON.parse(appendReqHeaders);
  }

  const appendResHeaders = url.searchParams.get("appendResHeaders");
  if (appendResHeaders) {
    options.appendResHeaders = JSON.parse(appendResHeaders);
  }

  const deleteReqHeaders = url.searchParams.get("deleteReqHeaders");
  if (deleteReqHeaders) {
    options.deleteReqHeaders = JSON.parse(deleteReqHeaders);
  }

  const deleteResHeaders = url.searchParams.get("deleteResHeaders");
  if (deleteResHeaders) {
    options.deleteResHeaders = JSON.parse(deleteResHeaders);
  }

  const requestHeaders = new Headers();

  if (!options.ignoreReqHeaders) {
    request.headers.forEach((value, key) => {
      requestHeaders.append(key.toLowerCase(), value);
    });
  }

  if (options.appendReqHeaders) {
    options.appendReqHeaders.forEach((header) => {
      if (requestHeaders.has(header[0].toLowerCase())) {
        requestHeaders.delete(header[0].toLowerCase());
      }

      requestHeaders.append(header[0].toLowerCase(), header[1]);
    });
  }

  if (options.deleteReqHeaders) {
    options.deleteReqHeaders.forEach((header) => {
      requestHeaders.delete(header.toLowerCase());
    });
  }

  requestHeaders.delete("host");
  requestHeaders.append("host", host);

  console.log("requestHeaders", logEntries(requestHeaders.entries()));

  const proxyResponse = await fetch(proxyUrl, {
    redirect: options.followRedirect ? "follow" : "manual",
    headers: requestHeaders,
  });

  const blacklistHeaders = [
    "access-control-allow-origin",
    "access-control-max-age",
    "access-control-allow-methods",
  ];

  const responseHeaders = new Headers(proxyResponse.headers);

  if (options.appendResHeaders) {
    options.appendResHeaders.forEach((header) => {
      if (responseHeaders.has(header[0].toLowerCase())) {
        responseHeaders.delete(header[0].toLowerCase());
      }

      responseHeaders.append(header[0].toLowerCase(), header[1]);
    });
  }

  if (options.deleteResHeaders) {
    options.deleteResHeaders.forEach((header) =>
      responseHeaders.delete(header.toLowerCase())
    );

    blacklistHeaders.forEach((header) => {
      responseHeaders.delete(header.toLowerCase());
    });
  }

  const corsHeaders = {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,HEAD,POST,OPTIONS",
    "access-control-max-age": "86400",
  };

  Object.entries(corsHeaders).forEach(([header, value]) => {
    responseHeaders.append(header.toLowerCase(), value);
  });

  let resBody = null;

  if (decompress) {
    resBody = await proxyResponse.arrayBuffer();
  } else {
    resBody = proxyResponse.body;
  }

  console.log("responseHeaders", logEntries(responseHeaders.entries()));

  const response = new Response(resBody, {
    status: proxyResponse.status,
    statusText: proxyResponse.statusText,
    headers: responseHeaders,
  });

  if (redirectWithProxy && responseHeaders.has("location")) {
    const location = responseHeaders.get("location");

    if (location) {
      return Response.redirect(location, proxyResponse.status);
    }
  }

  return response;
}

export default {
  async fetch(request: Request) {
    return handleRequest(request);
  },
};
