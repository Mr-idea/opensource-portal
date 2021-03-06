//
// Copyright (c) Microsoft. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.
//

'use strict';

const utils = require('../../utils');

module.exports = function addOrgPermissionsToRequest(req, res, next) {
  // Only compute once per request
  if (req.orgPermissions) {
    return next();
  }
  const oss = req.oss;
  const login = oss.usernames.github;
  const id = oss.id.github ? parseInt(oss.id.github, 10) : null;
  const organization = req.organization;
  const orgPermissions = {
    allowAdministration: false,
    owner: false,
    sudo: false,
  };
  req.orgPermissions = orgPermissions;
  organization.isSudoer(login, (sudoCheckError, isSudoer) => {
    oss.isPortalAdministrator((portalSudoError, isPortalSudoer) => {
      if (portalSudoError) {
        return next(portalSudoError);
      }
      // Indicate that the user is has sudo rights
      if (isSudoer === true || isPortalSudoer === true) {
        orgPermissions.sudo = true;
      }

      // Get the organization owners
      organization.getOwners((getOwnersError, owners) => {
        if (getOwnersError) {
          return next(getOwnersError);
        }

        // +MIDDLEWARE: provide this later if it is needed elsewhere
        req.orgOwners = owners;
        const set = new Set();
        for (let i = 0; i < owners.length; i++) {
          set.add(owners[i].id);
        }
        if (set.has(id)) {
          orgPermissions.owner = true;
        }
        req.orgOwnersSet = set;

        // Make a permission decision
        if (orgPermissions.owner || orgPermissions.sudo) {
          orgPermissions.allowAdministration = true;
        }

        // Are they even an organization member?
        const membershipCacheOptions = {
          maxAgeSeconds: 30,
          backgroundRefresh: false,
        };
        organization.getMembership(login, membershipCacheOptions, (getMembershipError, membershipStatus) => {
          if (getMembershipError && getMembershipError.innerError && getMembershipError.innerError.code === 404) {
            getMembershipError = null;
            membershipStatus = false;
          }
          if (getMembershipError) {
            return next(utils.wrapError(getMembershipError, `Unable to successfully validate whether you are already a member of the ${organization.name} organization on GitHub`));
          }
          if (membershipStatus && membershipStatus.state) {
            membershipStatus = membershipStatus.state;
          }
          orgPermissions.membershipStatus = membershipStatus;
  
          return next();
        });
      });
    });
  });
};
