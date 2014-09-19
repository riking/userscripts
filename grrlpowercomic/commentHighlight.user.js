// ==UserScript==
// @name Grrl Power New Comment Highlighter
// @namespace http://www.riking.org/userscripts
// @description Highlights new comments on the comic pages since your last visit.
// @match http://grrlpowercomic.com/archives/*
// @match http://grrlpowercomic.com/archives/*/comment-page-*
// @require https://ajax.googleapis.com/ajax/libs/jquery/2.1.1/jquery.min.js
// @version 0.3
// ==/UserScript==

(function() {

    // ############################################################
    // ## Library Functions

    var isExtension = false; // !!chrome.extension;

    var addJquery = function(callback) {
        // Add jQuery
        var jq = document.createElement('script');
        jq.src = "//ajax.googleapis.com/ajax/libs/jquery/2.1.1/jquery.min.js";
        jq.dataset.x_userscript_comment_hlght = "1";
        jq.onload = function() {
            // console.log("jquery script element loaded");
            $ = window.$ = window.jQuery;

            // Remove prior script elements (for reloading in development)
            $('head script[data-x_userscript_comment_hlght="1"]:not(:last)').remove();
            $('head style[data-x_userscript_comment_hlght="1"]:not(:last)').remove();
            $('#comment-wrapper .unread-comments-controls').remove();

            callback();
            //window.jQuery(document).ready(callback);
        };
        document.getElementsByTagName('head')[0].appendChild(jq);
    };

    // Multiline Function String - Nate Ferrero - Public Domain
    function heredoc(f) {
        return f.toString().match(/\/\*\s*([\s\S]*?)\s*\*\//m)[1];
    }

    if (!String.prototype.format) {
        String.prototype.format = function() {
            var args = arguments;
            return this.replace(/{(\d+)}/g, function(match, number) {
                return typeof args[number] != 'undefined'
                    ? args[number]
                    : match
                    ;
            });
        };
    }

    function filledArray(length, value) {
        //noinspection JSPotentiallyInvalidConstructorUsage
        return Array.apply(null, Array(length)).map(function() {
            return value;
        });
    }

    // ############################################################
    // ## Constants, CSS, HTML

    const DATA_VERSION = 3;

    const SERVER_TIMEZONE = "-0500";

    /**
     * Regex to parse the WordPress URLs on the site into an articleNumber ID and comment page.
     *
     * Group 1 - document type
     * Group 2 - document number
     * Group 3 - comment page (can be blank, blank = last page)
     *
     * @type {RegExp}
     */
    var URL_MATCHER = /grrlpowercomic\.com\/([^\/]+)\/(\d+)(?:\/comment-page(\d+))?/;

    var STYLE = heredoc(function() { /*
     .comment.unread > .comment-content {
     background-color: rgb(242, 225, 186);
     }

     .wp-paginate.wp-paginate-comments li > *:not(.title) {
     padding: 20px;
     }

     .wp-paginate.wp-paginate-comments a.next, .wp-paginate.wp-paginate-comments a.prev {
     background: rgb(220, 240, 215);
     }

     .commentnav {
     padding: 20px 0;
     }

     .commentsrsslink {
     float: left;
     }

     .unread-comments-controls {
     margin: 6px 0;
     }

     .unread-comments-clear {
     }

     .unread-comments-set-container {
     margin-left: 6px;
     }

     .unread-comments-msg.info {
     color: rgb(115, 115, 221);
     }
     .unread-comments-msg.success {
     color: rgb(35, 137, 44)
     }
     .unread-comments-msg.error {
     color: rgb(207, 53, 53);
     }

     .unread-comments-status.success {
     color: rgb(237, 159, 17);
     font-size: 16px;
     font-weight: bold;
     margin-bottom: 3px;
     }
     */
    });

    var CONTROLS_HTML = heredoc(function() {/*
     <div class="unread-comments-controls">
     <div class="unread-comments-status unread-comments-msg">&zwnj;</div>
     <button class="unread-comments-mark unread-comments-btn">Mark Comments Read</button>
     <button class="unread-comments-clear unread-comments-btn">Reset All Pages</button>
     <span class="unread-comments-set-container">
     Edit Read Data: [<a href class="unread-comments-set" data-target="comic">Comic</a>] [<a href class="unread-comments-set" data-target="page">Page</a>]
     </span>
     <div class="unread-comments-response unread-comments-msg">&zwnj;</span>
     </div>
     */
    });

    // ############################################################
    // ## Helper Functions

    var _storage;

    /**
     * Get the interface to the data storage.
     *
     * If the script is installed as a Chrome extension, then Chrome's synced
     * data storage will be used.
     *
     * If the script is installed as a userscript, then the localStorage
     * interface will be used.
     *
     * @returns {Storage}
     */
    function getStorage() {
        if (_storage) return _storage;

        if (typeof Storage === "undefined") {
            alert("Browser does not have localStorage, so the unread comments script cannot work.\n" +
                "\n\n" +
                "** Remove the script to get rid of this message. **\n\n" +
                "(Or grant localStorage access if it is being denied.)");
            throw new Error("localstorage failure");
        }

        var storage;
        if (chrome && chrome.storage) {
            storage = chrome.storage.sync;

            // Put in our internal API
            storage.setObject = function(key, value, callback) {
                var req = {};
                req[key] = JSON.stringify(value);
                this.set(req, function() {
                    if (chrome.runtime.lastError) {
                        console.error(chrome.runtime.lastError);
                    }
                    if (callback) callback();
                });
            };

            storage.getObject = function(key, callback) {
                this.get(key, function(items) {
                    if (chrome.runtime.lastError) {
                        console.error(chrome.runtime.lastError);
                        return callback(null);
                    }
                    if (items[key]) {
                        callback(JSON.parse(items[key]));
                    } else {
                        callback(null);
                    }
                });
            };

            storage.removeObject = function(key, callback) {
                this.remove(key, function() {
                    if (chrome.runtime.lastError) {
                        console.error(chrome.runtime.lastError);
                    }
                    if (callback) callback();
                });
            }
        } else {
            // Put our internal API in the Storage prototype
            // localStorage is a synchronous API, but chrome.storage is synchronous
            // so we have to add an asynchronous wrapper
            Storage.prototype.setObject = function(key, value, callback) {
                this.setItem(key, JSON.stringify(value));
                setTimeout(callback(), 0);
            };

            Storage.prototype.getObject = function(key, callback) {
                var value = JSON.parse(this.getItem(key));
                setTimeout(function() {
                    callback(value);
                }, 0);
            };

            Storage.prototype.removeObject = function(key, callback) {
                this.removeItem(key);
                setTimeout(callback(), 0);
            };

            try {
                storage = window.localStorage;
            } catch (e) {
            }
        }

        if (!storage) {
            alert("Browser appears to be denying access to localStorage!\n" +
                "\n" +
                "The unread comments script requires localStorage to function.\n" +
                "Please have the browser grant localStorage access to the script.\n" +
                "\n" +
                "(Or remove the unread comments script.)");
            throw new Error("localstorage failure");
        }
        return _storage = storage;
    }

    function getComicNumbers() {
        var matches = URL_MATCHER.exec(window.location);
        return {
            recognized: !!matches,
            articleType: matches && matches[1],
            articleNumber: matches && matches[2],
            page: Number((matches && matches[3]) || ($(".page.current").first().text()))
        };
    }

    function getPageNumber() {
        return getComicNumbers().page;
    }

    function getPageCount() {
        return Number($('.wp-paginate-comments .page').last().text());
    }

    function getComicDataKey() {
        return "unread-comments-" + getComicNumbers().articleNumber;
    }

    /**
     * Get the last-read data from the storage.
     *
     * If no data is stored, the lastReadComic property will be -1.
     *
     * @returns {Object} last-read data for this page
     */
    function getComicReadData(callback) {
        getStorage().getObject(getComicDataKey(), function(readData) {
            if (!readData) {
                readData = {
                    _V: DATA_VERSION,
                    lastReadComic: -1,
                    /**
                     * 1-indexed array of last-read times for the comic.
                     * Indexed by comment page number.
                     */
                    lastReadPerPage: filledArray(getPageCount() + 1, -1)
                };
            }

            // DATA MIGRATIONS START
            if (readData._V !== DATA_VERSION) {
                // Renamed VERSION to _V, changed from -1 to undefined/null
                if (readData.VERSION === 1) {
                    delete readData.VERSION;
                    readData._V = 2;
                }
                // Ensure the lastReadPerPage array is full size
                if (readData._V === 2) {
                    var arr = readData.lastReadPerPage;
                    arr.length = getPageCount();
                    readData._V = 3;
                }

                // ^ migrating code
                // ---- fence
                // v migration wrap-up

                if (readData._V !== DATA_VERSION) {
                    throw new Error("bad data migrations - failed to update version on every possible path");
                }
                return saveComicReadData(readData, function() {
                    callback(readData);
                });
            }
            // DATA MIGRATIONS END

            callback(readData);
        });
    }

    /**
     *
     * @param readData readData to save
     * @param [completionCallback] function to call on completion
     */
    function saveComicReadData(readData, completionCallback) {
        getStorage().setObject(getComicDataKey(), readData, function() {
            console.info("Comment highlighting data saved.");
            if (completionCallback) {
                completionCallback();
            }
        });
    }

    function getPageReadData(readData) {
        return readData.lastReadPerPage[getPageNumber()];
    }

    function highlightResultMessage(message, classes) {
        var $elem = $('.unread-comments-controls .unread-comments-status');
        $elem.removeClass('success info error').addClass(classes);
        $elem.text(message);
    }

    function buttonResultMessage(message, classes) {
        var $elem = $('.unread-comments-controls .unread-comments-response');
        $elem.removeClass('success info error').addClass(classes);
        $elem.text(message);
    }

    /**
     * Takes a jQuery selector for a li.comment inside the ol.commentList, and
     * returns the unix time that the comment was posted at.
     *
     * @param domComment element with .comment class
     * @returns {number} unix time of comment posting
     */
    function getCommentDate(domComment) {
        var dateText = $(domComment).find(">.comment-content .comment-time").first().text();
        return Date.parse(dateText.replace('at', '') + " " + SERVER_TIMEZONE);
    }

    /**
     * Get the jQuery group for all comment elements on the page.
     *
     * This function is memoized.
     *
     * @returns {Array} all comments on the page
     */
    function getAllComments() {
        if (_$comments) return _$comments;
        return _$comments = $('.comment');
    }

    var _$comments;


    // ############################################################

    function addControls() {
        // Add the controls into the document (in 2 locations!)
        var controls = jQuery.parseHTML(CONTROLS_HTML);
        $('#comment-wrapper .commentnav').after(controls);
        var $controls = $('#comment-wrapper .unread-comments-controls');

        $controls.find('.unread-comments-mark').click(clickMarkRead);
        $controls.find('.unread-comments-clear').click(clickDeleteData);
        $controls.find('.unread-comments-set').click(clickPickDate);
    }

    function doHighlight(readData) {
        if (readData.lastReadComic === -1) {
            return highlightResultMessage("(This is your first visit to the page, so no comments were highlighted.)", 'info');
        }

        var highlightingTimestamp = getPageReadData(readData);
        if (highlightingTimestamp === -1) {
            highlightingTimestamp = readData.lastReadComic;
        }

        var $allComments = getAllComments();
        var $commentsToHighlight = $allComments.filter(function() {
            return getCommentDate(this) >= highlightingTimestamp;
        });

        $commentsToHighlight.addClass('unread');
        if ($commentsToHighlight.length === 0) {
            highlightResultMessage("No unread comments on this page.", 'info');
        } else {
            highlightResultMessage("{0} unread comments on this page (out of {1}).".format(
                $commentsToHighlight.length,
                $allComments.length), 'success');
        }
    }

    /**
     * @param readData
     * @param [callback]
     */
    function saveFirstVisit(readData, callback) {
        if (readData.lastReadComic === -1) {
            var timestamp = Date.now();
            readData.lastReadComic = timestamp;
            // fill per-page with current time
            readData.lastReadPerPage = filledArray(getPageCount() + 1, timestamp);

            saveComicReadData(readData, callback);
        }
    }

    function rehighlight(readData) {
        getAllComments().removeClass('unread');
        doHighlight(readData);
    }

    // @export
    function deleteAllData() {
        var storage = getStorage();
        storage.clear();
    }

    // ############################################################
    // ## Button methods

    function clickMarkRead(e) {
        var $button = $(e.target);

        var pageNumber = getPageNumber(),
            now = Date.now();

        $button.attr('disabled', 1);
        getComicReadData(function(readData) {
            readData.lastReadComic = now;
            readData.lastReadPerPage[pageNumber] = now;

            saveComicReadData(readData, function() {
                buttonResultMessage("Last-read date marked for page {0}!".format(pageNumber), 'success');
                rehighlight(readData);
                $button.removeAttr('disabled');
            });
        });
    }

    function clickDeleteData(e) {
        var $button = $(e.target);

        $button.attr('disabled', 1);
        getComicReadData(function(readData) {
            getStorage().removeObject(getComicDataKey(), function() {
                getComicReadData(function(readData) {
                    saveFirstVisit(readData, function() {
                        if (readData.lastReadComic === -1) {
                            buttonResultMessage("(No data to reset)", 'info');
                        } else {
                            buttonResultMessage("Reset last-read data for all {0} comment pages.".format(getPageCount()), 'info');
                        }
                        rehighlight(readData);
                        $button.removeAttr('disabled');
                    });
                });
            });
        });
    }

    function clickPickDate(e) {
        var $button = $(e.target);
        e.preventDefault();

        var input, dateInput;

        function formatDate(input) {
            var date;
            if (typeof input === "number") {
                date = new Date(input);
            } else {
                date = input;
            }
            if (date.getTime() === -1) {
                date = new Date();
            }

            return date.toDateString() + " " + date.toLocaleTimeString();
        }

        $button.attr('disabled', 1);
        getComicReadData(function(readData) {
            console.log(readData);
            var currentData = "" +
                    "Current mark dates:\n" +
                    "\n" +
                    "  Comic {0}: {1}\n" +
                    "{2}\n",
                perPageData = "";

            readData.lastReadPerPage.forEach(function(timestamp, index) {
                if (index === 0) return;
                if (timestamp === -1) {
                    perPageData += "  Page {0}: No data\n".format(index);
                } else {
                    perPageData += "  Page {0}: {1}\n".format(index, formatDate(timestamp));
                }
            });

            currentData = currentData.format(
                getComicNumbers().articleNumber,
                formatDate(readData.lastReadComic),
                perPageData
            );

            var inputPrompt, inputCurrent, editFunc;

            if (e.target.dataset.target === "comic") {
                inputPrompt = "" +
                    currentData +
                    "Edit the new last-read time for the comic & current page:";
                inputCurrent = readData.lastReadComic;
                editFunc = function(readData, dateInput) {
                    // let's be nice to the user and set it for both the comic and the page
                    // seeing as the comic time only applies to pages that you HAVEN'T marked as read on
                    readData.lastReadComic = dateInput.getTime();
                    readData.lastReadPerPage[getPageNumber()] = dateInput.getTime();
                };
            } else if (e.target.dataset.target === "page") {
                inputPrompt = "" +
                    currentData +
                    "Edit the new last-read date for page {0}:".format(getPageNumber());
                inputCurrent = getPageReadData(readData);
                editFunc = function(readData, dateObject) {
                    readData.lastReadPerPage[getPageNumber()] = dateInput.getTime();
                }
            } else {
                console.error("Bad click event target! Expected a data-target value of 'comic' or 'page'", e);
                return;
            }

            input = prompt(inputPrompt, formatDate(inputCurrent));

            if (input === null) {
                buttonResultMessage("Edit cancelled.", 'info');
                $button.removeAttr('disabled');
                return;
            }

            dateInput = new Date(input);

            if (isNaN(dateInput.getTime())) {
                buttonResultMessage("Edit failed: Bad date format.", 'error');
                $button.removeAttr('disabled');
            } else {
                editFunc(readData, dateInput);

                rehighlight(readData);
                saveComicReadData(readData, function() {
                    buttonResultMessage("Edit successful; comments have been re-highlighted.", 'success');
                    $button.removeAttr('disabled');
                });
            }
        });
    }

    // ############################################################

    function onReady() {
        // add styles
        var css = document.createElement('style');
        css.innerHTML = STYLE;
        css.dataset.x_userscript_comment_hlght = "1";
        document.getElementsByTagName('head')[0].appendChild(css);

        addJquery(function() {
            getComicReadData(function(readData) {
                addControls(readData); // sync
                doHighlight(readData); // sync
                saveFirstVisit(readData); // asynchronous

                console.info("Grrl Power Comment Highlight script complete.");
            });
        });
    }

    onReady();
})();