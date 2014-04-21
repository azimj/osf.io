/**
 * Module that controls the Dropbox node settings. Includes Knockout view-model
 * for syncing data, and HGrid-folderpicker for selecting a folder.
 */



;(function (global, factory) {
    if (typeof define === 'function' && define.amd) {
        define(['knockout', 'jquery', 'js/folderPicker',
                'zeroclipboard', 'osfutils', 'knockoutpunches'], factory);
    } else if (typeof $script === 'function') {
        $script.ready(['folderPicker', 'zeroclipboard'], function() {
            global.DropboxNodeConfig  = factory(ko, jQuery, FolderPicker, ZeroClipboard);
            $script.done('dropboxNodeConfig');
        });
    } else {
        global.DropboxNodeConfig  = factory(ko, jQuery, FolderPicker, ZeroClipboard);
    }
}(this, function(ko, $, FolderPicker, ZeroClipboard) {
    'use strict';
    ko.punches.attributeInterpolationMarkup.enable();
    /**
     * Knockout view model for the Dropbox node settings widget.
     */
    var ViewModel = function(url, folderPicker) {
        var self = this;
        // Auth information
        self.nodeHasAuth = ko.observable(false);
        self.userHasAuth = ko.observable(false);
        // Currently linked folder, an Object of the form {name: ..., path: ...}
        self.folder = ko.observable({name: null, path: null});
        self.ownerName = ko.observable('');
        self.urls = ko.observable({});
        // Flashed messages
        self.message = ko.observable('');
        self.messageClass = ko.observable('text-info');
        // Display names
        self.PICKER = 'picker';
        self.SHARE = 'share';
        // Current folder display
        self.currentDisplay = ko.observable(null);
        // CSS selector for the folder picker div
        self.folderPicker = folderPicker;
        // Currently selected folder, an Object of the form {name: ..., path: ...}
        self.selected = ko.observable(null);
        // Emails of contributors, can only be populated by activating the share dialog
        self.emails = ko.observableArray([]);
        self.loading = ko.observable(false);
        // Whether the initial data has been fetched form the server. Used for
        // error handling.
        self.loadedSettings = ko.observable(false);
        // Whether the contributor emails have been loaded from the server
        self.loadedEmails = ko.observable(false);

        // List of contributor emails as a comma-separated values
        self.emailList = ko.computed(function() {
            return self.emails().join([', ']);
        });

        self.disableShare = ko.computed(function() {
            return !self.urls().share;
        });

        /**
         * Update the view model from data returned from the server.
         */
        self.updateFromData = function(data) {
            self.ownerName(data.ownerName);
            self.nodeHasAuth(data.nodeHasAuth);
            self.userHasAuth(data.userHasAuth);
            // Make sure folder has name and path properties defined
            self.folder(data.folder || {name: null, path: null});
            self.urls(data.urls);
        };

        self.fetchFromServer = function() {
            $.ajax({
                url: url, type: 'GET', dataType: 'json',
                success: function(response) {
                    self.updateFromData(response.result);
                    self.loadedSettings(true);
                },
                error: function(xhr, textStatus, error) {
                    console.error(textStatus); console.error(error);
                    self.changeMessage('Could not retrieve Dropbox settings at ' +
                        'this time. Please refresh ' +
                        'the page. If the problem persists, email ' +
                        '<a href="mailto:support@cos.io">support@cos.io</a>.',
                        'text-warning');
                }
            });
        };

        // Initial fetch from server
        self.fetchFromServer();

        self.toggleShare = function() {
            if (self.currentDisplay() === self.SHARE) {
                self.currentDisplay(null);
            } else {
                // Clear selection
                self.selected(null);
                self.currentDisplay(self.SHARE);
                self.activateShare();
            }
        };


        function onGetEmailsSuccess(response) {
            var emails = response.result.emails;
            self.emails(emails);
            self.loadedEmails(true);
        }

        self.activateShare = function() {
            if (!self.loadedEmails()) {
                $.ajax({
                    url: self.urls().emails, type: 'GET', dataType: 'json',
                    success: onGetEmailsSuccess
                });
            }
            var $copyBtn = $('#copyBtn');
            var client = new ZeroClipboard($copyBtn);
            client.on('ready', function(evt) {
                alert('ready!');
            });
        };


        /**
         * Whether or not to show the Import Access Token Button
         */
        self.showImport = ko.computed(function() {
            // Invoke the observables to ensure dependency tracking
            var userHasAuth = self.userHasAuth();
            var nodeHasAuth = self.nodeHasAuth();
            var loaded = self.loadedSettings();
            return userHasAuth && !nodeHasAuth && loaded;
        });

        /** Whether or not to show the full settings pane. */
        self.showSettings = ko.computed(function() {
            return self.nodeHasAuth();
        });

        /** Whether or not to show the Create Access Token button */
        self.showTokenCreateButton = ko.computed(function() {
            // Invoke the observables to ensure dependency tracking
            var userHasAuth = self.userHasAuth();
            var nodeHasAuth = self.nodeHasAuth();
            var loaded = self.loadedSettings();
            return !userHasAuth && !nodeHasAuth && loaded;
        });

        /** Computed functions for the linked and selected folders' display text.*/

        self.folderName = ko.computed(function() {
            // Invoke the observables to ensure dependency tracking
            var nodeHasAuth = self.nodeHasAuth();
            var folder = self.folder();
            return (nodeHasAuth && folder) ? folder.name : '';
        });

        self.selectedFolderName = ko.computed(function() {
            var userHasAuth = self.userHasAuth();
            var selected = self.selected();
            return (userHasAuth && selected) ? selected.name : '';
        });

        function onSubmitSuccess(response) {
            self.changeMessage('Successfully linked "' + self.selected().name +
                '". Go to the <a href="' +
                self.urls().files + '">Files page</a> to view your files.',
                'text-success', 5000);
            // Update folder in ViewModel
            self.folder(response.result.folder);
            self.urls(response.result.urls);
            self.selected(null);
        }

        function onSubmitError() {
            self.changeMessage('Could not change settings. Please try again later.', 'text-danger');
        }

        /**
         * Send a PUT request to change the linked Dropbox folder.
         */
        self.submitSettings = function() {
            $.osf.putJSON(self.urls().config, ko.toJS(self),
                onSubmitSuccess, onSubmitError);
        };

        self.cancelSelection = function() {
            self.selected(null);
        };

        /** Change the flashed message. */
        self.changeMessage = function(text, css, timeout) {
            self.message(text);
            var cssClass = css || 'text-info';
            self.messageClass(cssClass);
            if (timeout) {
                // Reset message after timeout period
                setTimeout(function() {
                    self.message('');
                    self.messageClass('text-info');
                }, timeout);
            }
        };

        /**
         * Send DELETE request to deauthorize this node.
         */
        function sendDeauth() {
            return $.ajax({
                url: self.urls().deauthorize,
                type: 'DELETE',
                success: function() {
                    // Update observables
                    self.nodeHasAuth(false);
                    self.selected(null);
                    self.currentDisplay(null);
                    self.changeMessage('Deauthorized Dropbox.', 'text-warning', 3000);
                },
                error: function() {
                    self.changeMessage('Could not deauthorize because of an error. Please try again later.',
                        'text-danger');
                }
            });
        }

        /** Pop up a confirmation to deauthorize Dropbox from this node.
         *  Send DELETE request if confirmed.
         */
        self.deauthorize = function() {
            bootbox.confirm({
                title: 'Deauthorize Dropbox?',
                message: 'Are you sure you want to remove this Dropbox authorization?',
                callback: function(confirmed) {
                    if (confirmed) {
                        return sendDeauth();
                    }
                }
            });
        };

        // Callback for when PUT request to import user access token
        function onImportSuccess(response) {
            var msg = response.message || 'Successfully imported access token from profile.';
            // Update view model based on response
            self.changeMessage(msg, 'text-success', 3000);
            self.updateFromData(response.result);
            self.activatePicker();
        }

        function onImportError() {
            self.message('Error occurred while importing access token.');
            self.messageClass('text-danger');
        }

        /**
         * Send PUT request to import access token from user profile.
         */
        self.importAuth = function() {
            bootbox.confirm({
                title: 'Import Dropbox Access Token?',
                message: 'Are you sure you want to authorize this project with your Dropbox access token?',
                callback: function(confirmed) {
                    if (confirmed) {
                        return $.osf.putJSON(self.urls().importAuth, {},
                            onImportSuccess, onImportError);
                    }
                }
            });
        };

        /** Callback for chooseFolder action.
        *   Just changes the ViewModel's self.selected observable to the selected
        *   folder.
        */
        function onPickFolder(evt, row) {
            evt.preventDefault();
            self.selected({name: 'Dropbox' + row.path, path: row.path});
            return false; // Prevent event propagation
        }

        // Hide +/- icon for root folder
        FolderPicker.Col.Name.showExpander = function(item) {
            return item.path !== '/';
        };

        /**
         * Activates the HGrid folder picker.
         */
        self.activatePicker = function() {
            self.currentDisplay(self.PICKER);
            // Show loading indicator
            self.loading(true);
            $(self.folderPicker).folderpicker({
                onPickFolder: onPickFolder,
                // Fetch Dropbox folders with AJAX
                data: self.urls().folders, // URL for fetching folders
                // Lazy-load each folder's contents
                // Each row stores its url for fetching the folders it contains
                fetchUrl: function(row) {
                    return row.urls.folders;
                },
                ajaxOptions: {
                   error: function(xhr, textStatus, error) {
                        self.loading(false);
                        console.error(textStatus); console.error(error);
                        self.changeMessage('Could not connect to Dropbox at this time. ' +
                                            'Please try again later.', 'text-warning');
                    }
                },
                init: function() {
                    // Hide loading indicator
                    self.loading(false);
                }
            });
        };

        /**
         * Toggles the visibility of the folder picker.
         */
        self.togglePicker = function() {
            // Toggle visibility of folder picker
            var shown = self.currentDisplay() === self.PICKER;
            if (!shown) {
                self.currentDisplay(self.PICKER);
                self.activatePicker();
            } else {
                self.currentDisplay(null);
                // Clear selection
                self.selected(null);
            }
        };
    };

    // Public API
    function DropboxNodeConfig(selector, url, folderPicker) {
        var self = this;
        self.url = url;
        self.folderPicker = folderPicker;
        self.viewModel = new ViewModel(url, folderPicker);
        $.osf.applyBindings(self.viewModel, selector);
    }

    return DropboxNodeConfig;
}));
