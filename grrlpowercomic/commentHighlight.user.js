// ==UserScript==
// @name Grrl Power New Comment Highlighter
// @namespace http://www.riking.org/userscripts
// @description Highlights new comments on the comic pages.
// @match http://grrlpowercomic.com/archives/*
// @match http://grrlpowercomic.com/archives/*/comment-page-*
// @require https://ajax.googleapis.com/ajax/libs/jquery/2.1.1/jquery.min.js
// @version 0.2
// ==/UserScript==

(function() {
    function addJquery(callback) {
        // Add jQuery
        var jq = document.createElement('script');
        jq.src = "//ajax.googleapis.com/ajax/libs/jquery/2.1.1/jquery.min.js";
        jq.dataset.x_userscript_comment_hlght = "1";
        jq.onload = function() {
            console.log("jquery script element loaded");
            $ = window.$ = window.jQuery;

            // Remove prior script elements (for reloading in development)
            $('head script[data-x_userscript_comment_hlght="1"]:not(:last)').remove();
            $('head style[data-x_userscript_comment_hlght="1"]:not(:last)').remove();
            $('#comment-wrapper .unread-comments-controls').remove();

            callback();
            //window.jQuery(document).ready(callback);
        };
        document.getElementsByTagName('head')[0].appendChild(jq);
    }

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

    // ############################################################

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
     float: right;
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
         <button class="unread-comments-clear unread-comments-btn">Delete Read Data</button>
         <span class="unread-comments-set-container">
            Edit Read Data: [<a href class="unread-comments-set" data-target="comic">Comic</a>] [<a href class="unread-comments-set" data-target="page">Page</a>]
         </span>
         <div class="unread-comments-response unread-comments-msg">&zwnj;</span>
     </div>
     */
    });

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

    // ############################################################

    var _storage;

    /**
     * Get the localStorage object, with error-checking on first call.
     *
     * @returns {Storage}
     */
    function getLocalStorage() {
        if (_storage) return _storage;

        if (typeof Storage === "undefined") {
            alert("Browser does not have localStorage, so the unread comments script cannot work.\n" +
                "\n\n" +
                "** Remove the script to get rid of this message. **\n\n" +
                "(Or grant localStorage access if it is being denied.)");
            throw new Error("localstorage failure");
        }

        // define setObject/getObject
        Storage.prototype.setObject = function(key, value) {
            this.setItem(key, JSON.stringify(value));
        };

        Storage.prototype.getObject = function(key) {
            return JSON.parse(this.getItem(key));
        };

        var storage;
        try {
            storage = window.localStorage;
        } catch (e) {
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

    function getPageNumber() {
        var matches = URL_MATCHER.exec(window.location);
        return {
            recognized: !!matches,
            articleType: matches && matches[1],
            articleNumber: matches && matches[2],
            page: Number((matches && matches[3]) || ($(".page.current").first().text()))
        };
    }

    function getComicDataKey() {
        return "unread-comments-" + getPageNumber().articleNumber;
    }

    const DATA_VERSION = 1;

    /**
     * Get the last-read data from the storage.
     *
     * If no data is stored, the lastReadComic property will be -1.
     *
     * @returns {Object} last-read data for this page
     */
    function getComicReadData() {
        var readData = getLocalStorage().getObject(getComicDataKey());
        if (!readData) {
            readData = {
                VERSION: DATA_VERSION,
                lastReadComic: -1,
                lastReadPerPage: []
            };
        }

        // DATA MIGRATIONS START
        if (readData.VERSION !== DATA_VERSION) {
            if (readData.VERSION === 0) {
                // noop - not a real version
                readData.VERSION = 1;
            }

            if (readData.VERSION !== DATA_VERSION) {
                throw new Error("bad data migrations - failed to update version on every possible path");
            }
            saveComicReadData(readData);
        }
        // DATA MIGRATIONS END

        return readData;
    }

    function saveComicReadData(readData) {
        getLocalStorage().setObject(getComicDataKey(), readData);
    }

    /**
     * Get the per-page read data from the result of
     * {@link getComicReadData()}, filling in the array with -1 values if
     * values are missing.
     *
     * @param readData {Object} result of {@link getComicReadData()}
     * @param [pageNumber] {Number} comment page # to get the data for
     * @param [fillDate] date to insert for missing values
     * @return {Number} last-read unix millis (-1 for missing data)
     */
    function fillPageReadData(readData, pageNumber, fillDate) {
        if (!pageNumber) {
            pageNumber = getPageNumber().page;
        }
        if (!fillDate) {
            fillDate = -1;
        }

        var dataArray = readData.lastReadPerPage;
        while (dataArray.length <= pageNumber) {
            dataArray.push(fillDate);
        }
    }

    function getPageReadData(readData) {
        fillPageReadData(readData);
        return readData.lastReadPerPage[getPageNumber() - 1];
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

    // ############################################################

    /**
     * Takes a jQuery selector for a li.comment inside the ol.commentList, and
     * returns the unix time that the comment was posted at.
     *
     * @param domComment element with .comment class
     * @returns {number} unix time of comment posting
     */
    function getCommentDate(domComment) {
        var dateText = $(domComment).find(".comment-time").text();
        return Date.parse(dateText.replace('at', ''));
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
        return _$comments = $('#comment-wrapper .commentlist .comment');
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

    function doHighlight() {
        var readData = getComicReadData();
        if (readData.lastReadComic === -1) {
            return highlightResultMessage("(No unread comment data.)", 'info');
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
            highlightResultMessage("No unread comments.", 'info');
        } else {
            highlightResultMessage("{0} unread comments on this page (out of {1}).".format(
                $commentsToHighlight.length,
                $allComments.length), 'success');
        }
    }

    function saveFirstVisit() {
        var data = getComicReadData();
        if (data.lastReadComic === -1) {
            var timestamp = Date.now();
            data.lastReadComic = timestamp;
            fillPageReadData(data, getPageNumber(), timestamp);

            saveComicReadData(data);
        }
    }

    // ############################################################

    function rehighlight() {
        getAllComments().removeClass('unread');
        doHighlight();
    }

    function clickMarkRead() {
        var data = getComicReadData(),
            pageNumber = getPageNumber(),
            now = new Date().getTime();

        // fill the array
        fillPageReadData(data, pageNumber);

        data.lastReadComic = now;
        data.lastReadPerPage[pageNumber] = now;

        saveComicReadData(data);
        buttonResultMessage("Last-read date marked! ", 'success');
    }

    function clickDeleteData() {
        var data = getComicReadData();
        getLocalStorage().removeItem(getComicDataKey());

        if (data.lastReadComic === -1) {
            buttonResultMessage("No data was present to delete on this page.", 'info');
        } else {
            buttonResultMessage("Deleted last-read data for comic {1}.".format(getPageNumber().articleNumber), 'info');
        }
    }

    function clickPickDate(e) {
        e.preventDefault();

        var data = getComicReadData();
        var input, dateInput;

        if (e.target.dataset.target === "comic") {
            input = prompt("Edit the last-read mark date:",
                new Date(data.lastReadComic).toString());

            if (input === null) {
                buttonResultMessage("Edit cancelled.", 'info');
                return;
            }

            dateInput = new Date(input);

            if (isNaN(dateInput.getDate())) {
                buttonResultMessage("Edit failed: Bad date format.", 'error');
            } else {
                data.lastReadComic = dateInput.getDate();
                saveComicReadData(data);
                buttonResultMessage("Edit successful.", 'success');
                rehighlight();
            }
        } else if (e.target.dataset.target === "page") {
            input = prompt("Edit the last-read mark date for page {0}:".format(getPageNumber()),
                new Date(getPageReadData(data)).toString());

            dateInput = new Date(input);

            if (isNaN(dateInput.getDate())) {
                buttonResultMessage("Edit failed: Bad date format.", 'error');
            } else {
                data.lastReadPerPage[getPageNumber()] = dateInput.getDate();
                saveComicReadData(data);
                buttonResultMessage("Edit successful.", 'success');
                rehighlight();
            }
        } else {
            buttonResultMessage("Edit failed: bad event target?? (this is a bug)", 'error');
            throw new Error("bad event target");
        }
    }

    // ############################################################

    function onReady() {
        console.log('onready');

        // add styles
        var css = document.createElement('style');
        css.innerHTML = STYLE;
        css.dataset.x_userscript_comment_hlght = "1";
        document.getElementsByTagName('head')[0].appendChild(css);

        addJquery(function() {
            addControls();
            doHighlight();
            saveFirstVisit();
            console.info("Grrl Power Comment Highlight script complete.");
        });
    }

    //document.addEventListener('DOMContentLoaded', onReady);
    onReady();
})();