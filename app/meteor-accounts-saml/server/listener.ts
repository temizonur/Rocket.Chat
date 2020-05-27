import { Meteor } from 'meteor/meteor';
import { WebApp } from 'meteor/webapp';
import { RoutePolicy } from 'meteor/routepolicy';
import bodyParser from 'body-parser';
import fiber from 'fibers';

import { SAML } from './lib/SAML';
import { SAMLUtils } from './lib/Utils';

RoutePolicy.declare('/_saml/', 'network');

const samlUrlToObject = function(url: string): Record<string, string> {
	// req.url will be '/_saml/<action>/<service name>/<credentialToken>'
	if (!url) {
		return null;
	}

	const splitUrl = url.split('?');
	const splitPath = splitUrl[0].split('/');

	// Any non-saml request will continue down the default
	// middlewares.
	if (splitPath[1] !== '_saml') {
		return null;
	}

	const result = {
		actionName: splitPath[2],
		serviceName: splitPath[3],
		credentialToken: splitPath[4],
	};

	SAMLUtils.log(result);
	return result;
};

const middleware = function(req: object, res: object, next: function): void {
	// Make sure to catch any exceptions because otherwise we'd crash
	// the runner
	try {
		const samlObject = samlUrlToObject(req.url);
		if (!samlObject || !samlObject.serviceName) {
			next();
			return;
		}

		if (!samlObject.actionName) {
			throw new Error('Missing SAML action');
		}

		const service = SAMLUtils.getServiceProviderOptions(samlObject.serviceName);

		SAML.processRequest(req, res, service, samlObject);
	} catch (err) {
		// #ToDo: Ideally we should send some error message to the client, but there's no way to do it on a redirect right now.
		console.log(err);

		const url = Meteor.absoluteUrl('home');
		res.writeHead(302, {
			Location: url,
		});
		res.end();
	}
};

// Listen to incoming SAML http requests
WebApp.connectHandlers.use(bodyParser.json()).use(function(req, res, next) {
	// Need to create a fiber since we're using synchronous http calls and nothing
	// else is wrapping this in a fiber automatically
	fiber(function() {
		middleware(req, res, next);
	}).run();
});
