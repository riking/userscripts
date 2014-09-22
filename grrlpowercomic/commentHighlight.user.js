// ==UserScript==
// @name Grrl Power New Comment Highlighter
// @namespace http://www.riking.org/userscripts
// @description Highlights new comments on the comic pages since your last visit.
// @match http://grrlpowercomic.com/archives/*
// @match http://grrlpowercomic.com/archives/*/comment-page-*
// @include http://grrlpowercomic.com/*
// @grant unsafeWindow
// @require https://ajax.googleapis.com/ajax/libs/jquery/2.1.1/jquery.min.js
// @version 0.4.10
// ==/UserScript==

/* jshint multistr: true */
/* global $ */

(function() {
    "use strict";

    // ############################################################
    // ## Capabilities

    if (typeof Storage === "undefined") {
        console.warn("localStorage not supported. Comment highlighting disabled.");
        return;
    }

    if (!unsafeWindow) {
        // have greasemonkey behave like chrome extension content script
        unsafeWindow = window;
    }

    try {
        var a = unsafeWindow.localStorage;
    } catch (ex) {
        console.warn("localStorage access denied. Comment highlighting disabled.", ex);
        return;
    }

    if (unsafeWindow.commentHighlightingOnWebpage) {
        console.warn("Extension-based comment highlighting disabled in favor of server-provided version.");
        return;
    }

    // ############################################################
    // ## Library Functions

    var isExtension = false; // !!chrome.extension;

    var addJquery = function(callback) {
        if (window.jQuery) {
            // jQuery is already loaded, yay
            $ = window.$ = window.jQuery;
            $('head style[data-x_userscript_comment_hlght="1"]:not(:last)').remove();
            $('#comment-wrapper .unread-comments-controls').remove();
            return callback();
        }

        // Add jQuery
        var jq = document.createElement('script');
        jq.src = "//ajax.googleapis.com/ajax/libs/jquery/2.1.1/jquery.min.js";
        jq.dataset.x_userscript_comment_hlght = "1";
        jq.onload = function() {
            $ = window.$ = window.jQuery;

            // Remove prior script elements (for reloading in development)
            $('head script[data-x_userscript_comment_hlght="1"]:not(:last)').remove();
            $('head style[data-x_userscript_comment_hlght="1"]:not(:last)').remove();
            $('#comment-wrapper .unread-comments-controls').remove();

            callback();
        };
        document.getElementsByTagName('head')[0].appendChild(jq);
    };

    if (!String.prototype.format) {
        String.prototype.format = function() {
            var args = arguments;
            return this.replace(/{(\d+)}/g, function(match, number) {
                return typeof args[number] !== 'undefined' ? args[number] : match;
            });
        };
    }

    function filledArray(length, value) {
        // the Array(length) call, without 'new', is correct.
        // somehow. Not sure why. weird stuff.

        //noinspection JSPotentiallyInvalidConstructorUsage
        return Array.apply(null, Array(length)).map(function() {
            return value;
        });
    }

    // ############################################################
    // ## Constants, CSS, HTML

    /* jshint ignore: start */

    var DATA_VERSION = 3;

    var SERVER_TIMEZONE = "-0500";

    /**
     * Regex to parse the WordPress URLs on the site into an articleNumber ID and comment page.
     *
     * Group 1 - document type
     * Group 2 - document number
     * Group 3 - comment page (can be blank, blank = last page)
     *
     * @type {RegExp}
     */
    var URL_MATCHER = /grrlpowercomic\.com\/([^\/]+)\/(\d+)(?:\/comment-page-(\d+))?/;

    var LOADING_SPINNER_DATA = "data:image/gif;base64,R0lGODlhEAAQAPIAANHT3wAAAJ+hqjY2OQAAAFBRVmprcnh5gCH/C05FVFNDQVBFMi4wAwEAAAAh/hpDcmVhdGVkIHdpdGggYWpheGxvYWQuaW5mbwAh+QQJCgAAACwAAAAAEAAQAAADMwi63P4wyklrE2MIOggZnAdOmGYJRbExwroUmcG2LmDEwnHQLVsYOd2mBzkYDAdKa+dIAAAh+QQJCgAAACwAAAAAEAAQAAADNAi63P5OjCEgG4QMu7DmikRxQlFUYDEZIGBMRVsaqHwctXXf7WEYB4Ag1xjihkMZsiUkKhIAIfkECQoAAAAsAAAAABAAEAAAAzYIujIjK8pByJDMlFYvBoVjHA70GU7xSUJhmKtwHPAKzLO9HMaoKwJZ7Rf8AYPDDzKpZBqfvwQAIfkECQoAAAAsAAAAABAAEAAAAzMIumIlK8oyhpHsnFZfhYumCYUhDAQxRIdhHBGqRoKw0R8DYlJd8z0fMDgsGo/IpHI5TAAAIfkECQoAAAAsAAAAABAAEAAAAzIIunInK0rnZBTwGPNMgQwmdsNgXGJUlIWEuR5oWUIpz8pAEAMe6TwfwyYsGo/IpFKSAAAh+QQJCgAAACwAAAAAEAAQAAADMwi6IMKQORfjdOe82p4wGccc4CEuQradylesojEMBgsUc2G7sDX3lQGBMLAJibufbSlKAAAh+QQJCgAAACwAAAAAEAAQAAADMgi63P7wCRHZnFVdmgHu2nFwlWCI3WGc3TSWhUFGxTAUkGCbtgENBMJAEJsxgMLWzpEAACH5BAkKAAAALAAAAAAQABAAAAMyCLrc/jDKSatlQtScKdceCAjDII7HcQ4EMTCpyrCuUBjCYRgHVtqlAiB1YhiCnlsRkAAAOwAAAAAAAAAAAA==";

    var STYLE = "\
.wp-paginate.wp-paginate-comments li > *:not(.title) { \
    /* padding: 20px; */ \
}\
\
.wp-paginate.wp-paginate-comments a.next, .wp-paginate.wp-paginate-comments a.prev { \
    background: rgb(220, 240, 215); \
}\
\
.commentnav { \
    /* padding: 20px 0; */ \
}\
\
.commentsrsslink { \
    float: left; \
}\
.comment.unread { \
    background-color: rgb(242, 225, 186); \
}\
\
.unread-comments-controls { \
    margin: 6px 0; \
}\
\
.unread-comments-clear { \
}\
\
.unread-comments-set-container { \
    margin-left: 6px; \
}\
\
.unread-comments-msg.info { \
    color: rgb(115, 115, 221); \
}\
.unread-comments-msg.success { \
    color: rgb(35, 137, 44) \
}\
.unread-comments-msg.error { \
    color: rgb(207, 53, 53); \
}\
\
.unread-comments-status.success { \
    color: rgb(237, 159, 17); \
    font-size: 16px; \
    font-weight: bold; \
    margin-bottom: 3px; \
}\
\
.unread-comments-jump a { \
    margin: 1px; \
    padding: 4px; \
}\
\
.unread-comments-jumper { \
    margin: 5px 0; \
}\
\
.hidden {\
  display: none;\
}\
";

    var CONTROLS_HTML = ' \
<div class="unread-comments-controls"> \
    <div class="unread-comments-status unread-comments-msg">&zwnj;</div> \
    <div class="unread-comments-jumper hidden"><span class="unread-comments-jumper-instructions">Jump to unread: </span></div> \
    <button class="unread-comments-mark unread-comments-btn">Mark Comments Read</button> \
    <button class="unread-comments-clear unread-comments-btn">Reset All Pages</button> \
    <span class="unread-comments-set-container"> \
        Edit Read Data: [<a href class="unread-comments-set" data-target="comic">Comic</a>] [<a href class="unread-comments-set" data-target="page">Page</a>] \
    </span> \
    <div class="unread-comments-response unread-comments-msg">&zwnj;</span> \
</div>';

    var JUMPER_ITEM_HTML = '<span class="unread-comments-jump"><a href="#{0}">#{1}</a></span>';

    var LOADING_NOTICE_HTML = '<span class="comments-page-loading hidden"><img src="' + LOADING_SPINNER_DATA + '" /> Loading... (<a href="{0}">Give up</a>) </span>';

    /* jshint ignore: end */

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

        var storage,
            useChromeStorage = false;

        try {
            useChromeStorage = chrome && chrome.storage;
        } catch (e) {
        }

        if (useChromeStorage) {
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
            };
        } else {
            var storagePrototype = unsafeWindow.Storage.prototype;

            // Put our internal API in the Storage prototype
            // localStorage is a synchronous API, but chrome.storage is synchronous
            // so we have to add an asynchronous wrapper
            storagePrototype.setObject = function(key, value, callback) {
                this.setItem(key, JSON.stringify(value));
                setTimeout(callback(), 0);
            };

            storagePrototype.getObject = function(key, callback) {
                var value = JSON.parse(this.getItem(key));
                setTimeout(function() {
                    callback(value);
                }, 0);
            };

            storagePrototype.removeObject = function(key, callback) {
                this.removeItem(key);
                setTimeout(callback(), 0);
            };

            try {
                storage = unsafeWindow.localStorage;
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
        _storage = storage;
        return _storage;
    }

    var currentLocation = window.location.toString();

    /**
     *
     * @param [url] url to parse, or undefined for current page
     * @returns {Object}
     */
    function getComicNumbers(url) {
        if (!url) url = currentLocation;

        var matches = URL_MATCHER.exec(url);
        return {
            recognized: !!matches,
            articleType: matches && matches[1],
            articleNumber: matches && matches[2],
            page: Number((matches && matches[3]) || ($(".page.current").first().text())) || 1
        };
    }

    function getPageNumber() {
        return getComicNumbers().page;
    }

    function getPageCount() {
        return Number($('.wp-paginate-comments .page').last().text()) || 1;
    }

    function getComicDataKey() {
        return "unread-comments-" + getComicNumbers().articleNumber;
    }

    function buildPageLink(comicNumbers) {
        if (!comicNumbers.recognized) {
            return "";
        }
        return "http://grrlpowercomic.com/" + comicNumbers.articleType + "/" + comicNumbers.articleNumber + "/comment-page-" + comicNumbers.page;
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

            // Fill in data for new pages that were added
            while (readData.lastReadPerPage.length < (getPageCount() + 1)) {
                readData.lastReadPerPage.push(readData.lastReadComic);
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
        if (! _$comments) {
            _$comments = $('.comment');
        }
        return _$comments;
    }

    var _$comments;


    // ############################################################

    function addControls() {
        // Add the controls into the document (in 2 locations!)
        var controls = jQuery.parseHTML(CONTROLS_HTML);
        var $nav = $('#comment-wrapper .commentnav');
        if ($nav.length) {
            $nav.after(controls);
        } else {
            // Single page of comments
            $('.commentsrsslink, #respond').before(controls);
        }

        var $controls = $('#comment-wrapper .unread-comments-controls');

        $controls.find('.unread-comments-mark').click(clickMarkRead);
        $controls.find('.unread-comments-clear').click(clickDeleteData);
        $controls.find('.unread-comments-set').click(clickPickDate);
        $('.page, .prev, .next').off('click');
        // Hidden flag feature gate
        // to enable, do:
        //  > window.localStorage.allowDynamic = true;
        if (unsafeWindow.localStorage.allowDynamic) {
            $('.page, .prev, .next').click(clickPageLink);
        } else {
            console.info("Dynamic loading of other comment pages is disabled.");
            console.info("To opt-in, type 'window.localStorage.allowDynamic = true;' below.");
        }
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

        insertJumperLinks($commentsToHighlight);
    }

    function insertJumperLinks($highlighted) {
        if ($highlighted.length > 0 && $highlighted.length < 10) {
            var $jumper = $('.unread-comments-jumper');

            // WARNING - ARGUMENT ORDER IS FLIPPED FROM Array.map()
            var jumpLinks = $highlighted.map(function(index, domComment) {
                return jQuery.parseHTML(JUMPER_ITEM_HTML.format(domComment.id, index + 1));
            });

            $jumper.removeClass('hidden');
            $jumper.append($(jumpLinks));

            // bring you slightly below the top of the comment
            $('.unread-comments-jump a').click(function() {
                var target = $(this.hash);
                $(window).scrollTop(target.offset().top - 70);
                return false;
            });
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
        } else {
            setTimeout(callback, 0);
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

        var pageNumber = getPageNumber();
        var lastCommentDate = Math.max.apply(Math, $.makeArray(
            getAllComments().map(function(idx, domComment) {
                return getCommentDate(domComment);
            })
        )) + 1;

        $button.attr('disabled', 1);
        getComicReadData(function(readData) {
            readData.lastReadComic = lastCommentDate;
            readData.lastReadPerPage[pageNumber] = lastCommentDate;

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
                    "Edit the new last-read time for newly added pages & the current page:";
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
                };
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

    function clickPageLink(e) {
        if (e.which !== 1) {
            return; // left clicks ONLY
        }

        var $link = $(e.target),
            requestUrl;

        if ($link.hasClass('current')) {
            requestUrl = buildPageLink(getComicNumbers());
        } else {
            requestUrl = buildPageLink(getComicNumbers($link.attr('href')));

            if (!requestUrl) {
                console.warn('failure to parse link?', $link);
                return;
            }
        }

        console.log("Clicked on page link");

        var loading = jQuery.parseHTML(LOADING_NOTICE_HTML.format(requestUrl));
        var $pager = $('#comment-wrapper .commentnav .wp-paginate-comments');
        $pager.append(loading);

        $link.off('click');
        $('.comments-page-loading').removeClass('hidden');

        $.ajax(requestUrl, {
            dataType: 'html',
            success: function(data, textStatus, jqXHR) {
                console.info("Loaded comments page", textStatus, jqXHR);

                var returnedDocument = jQuery.parseHTML(data),
                    $returnedDocument = $(returnedDocument),
                    $returnedComments = $returnedDocument.find('#comment-wrapper');

                currentLocation = requestUrl; // this updates getComicNumbers()
                if (history) {
                    history.replaceState(undefined, undefined, requestUrl);
                }

                getComicReadData(function(readData) {
                    $('#comment-wrapper').remove();
                    $($('#comment-wrapper-head')).after($returnedComments);
                    _$comments = null;

                    addControls(readData);
                    doHighlight(readData);
                    saveFirstVisit(readData);

                    setTimeout(function() {
                        $(window).scrollTop($('#comments').offset().top - 70);
                    }, 0);
                });
            },

            error: function(jqXHR, textStatus, errorThrown) {
                console.warn("Dynamic comments request failed, falling back to page load.", jqXHR, textStatus, errorThrown);

                $('.comments-page-loading').addClass('hidden');
                buttonResultMessage("Dynamic request failed.");
                window.location.href = requestUrl;
            },

            complete: function() {
            }
        });

        // do this LAST!
        // don't want to break normal people.
        e.preventDefault();
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
                saveFirstVisit(readData, function() {
                    console.info("Grrl Power Comment Highlight script initialized.");
                }); // asynchronous
            });
        });
    }

    onReady();
})();