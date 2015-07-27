/*
 * Copyright (C) 2015  Ben Ockmore
 *               2015  Sean Burke
 *
 * This program is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation; either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along
 * with this program; if not, write to the Free Software Foundation, Inc.,
 * 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.
 */

'use strict';

var express = require('express');
var router = express.Router();
var auth = require('../../helpers/auth');
var Edition = require('../../data/entities/edition');
var User = require('../../data/user');
var _ = require('underscore');

var React = require('react');
var EditForm = React.createFactory(require('../../../client/components/forms/edition.jsx'));

/* Middleware loader functions. */
var makeEntityLoader = require('../../helpers/middleware').makeEntityLoader;

var loadEditionStatuses = require('../../helpers/middleware').loadEditionStatuses;
var loadLanguages = require('../../helpers/middleware').loadLanguages;
var loadEntityRelationships = require('../../helpers/middleware').loadEntityRelationships;
var loadIdentifierTypes = require('../../helpers/middleware').loadIdentifierTypes;

var bbws = require('../../helpers/bbws');
var Promise = require('bluebird');

function getConflictingFields(editions) {
	var commonFields = {
		publication: null,
		creator_credit: null,
		edition_format: null,
		edition_status: null,
		publisher: null,
		language: null,
		release_date: null
	};

	console.log('DUMP');
	console.log(editions[0]);

	console.log(_.uniq(_.compact(editions.map(function(edition) {
		return edition.publication ? edition.publication.bbid : null;
	}))));

	console.log(_.uniq(_.compact(editions.map(function(edition) {
		return edition.creator_credit ? edition.creator_credit.creator_credit_id : null;
	}))));

	console.log(_.uniq(_.compact(editions.map(function(edition) {
		return edition.edition_format ? edition.edition_format.edition_format_id : null;
	}))));

	console.log(_.uniq(_.compact(editions.map(function(edition) {
		return edition.edition_status ? edition.edition_status.edition_status_id : null;
	}))));

	console.log(_.uniq(_.compact(editions.map(function(edition) {
		return edition.publisher ? edition.publisher.bbid : null;
	}))));

	console.log(_.uniq(_.compact(editions.map(function(edition) {
		return edition.language ? edition.language.id : null;
	}))));

	console.log(_.uniq(_.compact(editions.map(function(edition) {
		return edition.release_date ? edition.edition_status.release_date : null;
	}))));
}

/* If the route specifies a BBID, load the Edition for it. */
router.param('bbid', makeEntityLoader(Edition, 'Edition not found'));

router.get('/:bbid', loadEntityRelationships, function(req, res) {
	var edition = res.locals.entity;
	var title = 'Edition';

	if (edition.default_alias && edition.default_alias.name) {
		title = 'Edition “' + edition.default_alias.name + '”';
	}

	var mergeLevel = 1; // This entity can be merged
	if(req.session.mergeEntities &&
		 _.contains(req.session.mergeEntities, edition.bbid)) {
		if (req.session.mergeEntities.length > 1) {
			mergeLevel = 2; // Merge can be completed
		}
		else {
			mergeLevel = 0; // Merge cannot be completed
		}
	}

	res.render('entity/view/edition', {
		title: title,
		mergeLevel: mergeLevel
	});
});

router.get('/:bbid/revisions', function(req, res) {
	var edition = res.locals.entity;
	var title = 'Edition';

	if (edition.default_alias && edition.default_alias.name) {
		title = 'Edition “' + edition.default_alias.name + '”';
	}

	bbws.get('/edition/' + edition.bbid + '/revisions')
		.then(function(revisions) {
			var promisedUsers = {};
			revisions.objects.forEach(function(revision) {
				if (!promisedUsers[revision.user.user_id]) {
					promisedUsers[revision.user.user_id] = User.findOne(revision.user.user_id);
				}
			});

			Promise.props(promisedUsers).then(function(users) {
				res.render('entity/revisions', {
					title: title,
					revisions: revisions,
					users: users
				});
			});
		});
});

router.get('/:bbid/delete', auth.isAuthenticated, function(req, res) {
	var edition = res.locals.entity;
	var title = 'Edition';

	if (edition.default_alias && edition.default_alias.name) {
		title = 'Edition “' + edition.default_alias.name + '”';
	}

	res.render('entity/delete', {
		title: title
	});
});

router.get('/:bbid/merge/select', auth.isAuthenticated, function(req, res) {
	var entity = res.locals.entity;

	// Store this entity bbid in the session
	if (req.session.mergeEntities) {
		req.session.mergeEntities.push(entity.bbid);
	}
	else {
		req.session.mergeEntities = [entity.bbid];
	}

	res.redirect('/edition/' + entity.bbid);
});

router.get('/:bbid/merge/remove', auth.isAuthenticated, function(req, res) {
	var entity = res.locals.entity;

	// Remove the entity from the merge
	req.session.mergeEntities = _.without(req.session.mergeEntities, entity.bbid);

	res.redirect('/edition/' + entity.bbid);
});

router.get('/:bbid/merge/cancel', auth.isAuthenticated, function(req, res) {
	var entity = res.locals.entity;

	// Cancel the merge
	req.session.mergeEntities = null;

	res.redirect('/edition/' + entity.bbid);
});


router.get('/:bbid/merge', auth.isAuthenticated, function(req, res) {
	var editionsPromises = req.session.mergeEntities.map(function(entity) {
		return Edition.findOne(entity, {populate: ['publication', 'publisher']});
	});

	Promise.all(editionsPromises).then(function(editions) {
		console.log("SORTING FIELDS!");
		getConflictingFields(editions);
	});

	//res.render('entity/delete', {
	//	title: title
	//});
});

router.post('/:bbid/delete/confirm', function(req, res) {
	var edition = res.locals.entity;

	Edition.del(edition.bbid, {
			revision: {note: req.body.note}
		},
		{
			session: req.session
		})
		.then(function() {
			res.redirect(303, '/edition/' + edition.bbid);
		});
});

// Creation

router.get('/create', auth.isAuthenticated, loadIdentifierTypes, loadEditionStatuses, loadLanguages, function(req, res) {
	var props = {
		languages: res.locals.languages,
		editionStatuses: res.locals.editionStatuses,
		identifierTypes: res.locals.identifierTypes,
		submissionUrl: '/edition/create/handler'
	};

	var markup = React.renderToString(EditForm(props));

	res.render('entity/create/edition', {
		title: 'Add Edition',
		heading: 'Create Edition',
		subheading: 'Add a new Edition to BookBrainz',
		props: props,
		markup: markup
	});
});

router.get('/:bbid/edit', auth.isAuthenticated, loadIdentifierTypes, loadEditionStatuses, loadLanguages, function(req, res) {
	var edition = res.locals.entity;

	var props = {
		languages: res.locals.languages,
		editionStatuses: res.locals.editionStatuses,
		identifierTypes: res.locals.identifierTypes,
		edition: edition,
		submissionUrl: '/edition/' + edition.bbid + '/edit/handler'
	};

	var markup = React.renderToString(EditForm(props));

	res.render('entity/create/edition', {
		title: 'Edit Edition',
		heading: 'Edit Edition',
		subheading: 'Edit an existing Edition in BookBrainz',
		props: props,
		markup: markup
	});
});

router.post('/create/handler', auth.isAuthenticated, function(req, res) {
	var changes = {
		bbid: null
	};

	if (req.body.editionStatusId) {
		changes.edition_status = {
			edition_status_id: req.body.editionStatusId
		};
	}

	if (req.body.publication) {
		changes.publication = req.body.publication;
	}

	if (req.body.publisher) {
		changes.publisher = req.body.publisher;
	}

	if (req.body.languageId) {
		changes.language = {
			language_id: req.body.languageId
		};
	}

	if (req.body.releaseDate) {
		changes.release_date = req.body.releaseDate;
	}

	if (req.body.disambiguation) {
		changes.disambiguation = req.body.disambiguation;
	}

	if (req.body.annotation) {
		changes.annotation = req.body.annotation;
	}

	if (req.body.note) {
		changes.revision = {
			note: req.body.note
		};
	}

	var newIdentifiers = req.body.identifiers.map(function(identifier) {
		return {
			value: identifier.value,
			identifier_type: {
				identifier_type_id: identifier.typeId
			}
		};
	});

	if (newIdentifiers.length) {
		changes.identifiers = newIdentifiers;
	}

	var newAliases = [];

	req.body.aliases.forEach(function(alias) {
		if (!alias.name && !alias.sortName) {
			return;
		}

		newAliases.push({
			name: alias.name,
			sort_name: alias.sortName,
			language_id: alias.language,
			primary: alias.primary,
			default: alias.default
		});
	});

	if (newAliases.length) {
		changes.aliases = newAliases;
	}

	Edition.create(changes, {
			session: req.session
		})
		.then(function(revision) {
			res.send(revision);
		});
});

router.post('/:bbid/edit/handler', auth.isAuthenticated, function(req, res) {
	var edition = res.locals.entity;

	var changes = {
		bbid: edition.bbid
	};

	var editionStatusId = req.body.editionStatusId;
	if ((!edition.edition_status) ||
		(edition.edition_status.edition_status_id !== editionStatusId)) {
		changes.edition_status = {
			edition_status_id: editionStatusId
		};
	}

	var publication = req.body.publication;
	if (!edition.publication || edition.publication.bbid !== publication) {
		changes.publication = publication;
	}

	var publisher = req.body.publisher;
	if (!edition.publisher || edition.publisher.bbid !== publisher) {
		changes.publisher = publisher;
	}

	var languageId = req.body.languageId;
	if ((!edition.language) || (edition.language.language_id !== languageId)) {
		changes.language = {
			language_id: languageId
		};
	}

	var releaseDate = req.body.releaseDate;
	if (edition.release_date !== releaseDate) {
		changes.release_date = releaseDate ? releaseDate : null;
	}

	var disambiguation = req.body.disambiguation;
	if ((!edition.disambiguation) ||
		(edition.disambiguation.comment !== disambiguation)) {
		changes.disambiguation = disambiguation ? disambiguation : null;
	}

	var annotation = req.body.annotation;
	if ((!edition.annotation) ||
		(edition.annotation.content !== annotation)) {
		changes.annotation = annotation ? annotation : null;
	}

	if (req.body.note) {
		changes.revision = {
			note: req.body.note
		};
	}

	var currentIdentifiers = edition.identifiers.map(function(identifier) {
		var nextIdentifier = req.body.identifiers[0];

		if (identifier.id !== nextIdentifier.id) {
			// Remove the alias
			return [identifier.id, null];
		}
		else {
			// Modify the alias
			req.body.identifiers.shift();
			return [nextIdentifier.id, {
				value: nextIdentifier.value,
				identifier_type: {
					identifier_type_id: nextIdentifier.typeId
				}
			}];
		}
	});

	var newIdentifiers = req.body.identifiers.map(function(identifier) {
		// At this point, the only aliases should have null IDs, but check anyway.
		if (identifier.id) {
			return null;
		}
		else {
			return [null, {
				value: identifier.value,
				identifier_type: {
					identifier_type_id: identifier.typeId
				}
			}];
		}
	});

	changes.identifiers = currentIdentifiers.concat(newIdentifiers);

	var currentAliases = [];

	edition.aliases.forEach(function(alias) {
		var nextAlias = req.body.aliases[0];

		if (alias.id !== nextAlias.id) {
			// Remove the alias
			currentAliases.push([alias.id, null]);
		}
		else {
			// Modify the alias
			req.body.aliases.shift();
			currentAliases.push([nextAlias.id, {
				name: nextAlias.name,
				sort_name: nextAlias.sortName,
				language_id: nextAlias.language,
				primary: nextAlias.primary,
				default: nextAlias.default
			}]);
		}
	});

	var newAliases = [];

	req.body.aliases.forEach(function(alias) {
		// At this point, the only aliases should have null IDs, but check anyway.
		if (alias.id || (!alias.name && !alias.sortName)) {
			return;
		}

		newAliases.push([null, {
			name: alias.name,
			sort_name: alias.sortName,
			language_id: alias.language,
			primary: alias.primary,
			default: alias.default
		}]);
	});

	changes.aliases = currentAliases.concat(newAliases);

	Edition.update(edition.bbid, changes, {
			session: req.session
		})
		.then(function(revision) {
			res.send(revision);
		});
});

module.exports = router;
